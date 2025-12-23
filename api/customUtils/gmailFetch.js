require('dotenv').config();
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { emailToMarkdown } = require('~/customUtils/htmlToMd');
const mongoose = require('mongoose');
const pLimit = require('p-limit');

const GOOGLE_API_KEY = process.env.GOOGLE_KEY;

const EmailSchema = new mongoose.Schema({
  messageId: { type: String, unique: true, required: true },
  threadId: String,
  from: String,
  date: String,
  subject: String,
  summary: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { strict: false });

const Email = mongoose.models.Email || mongoose.model('Email', EmailSchema);

async function summarizeEmail(text) {
  const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
  if (!text || text.trim().length === 0) {
    return false;
  }
  var prompt = 'email condense,distill,concise,info-dense,phrases,word soup,as short as possible,no complete sentences,no newlines,ensure all datetimes names actions meanings are clear,result should be understandable without external context,use abbreviations: ```';
  prompt += text + '```'
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const result = await model.generateContent(prompt.trim());
  return result.response.text().trim();
}

function setupAuth() {
  const clientStr = process.env.GOOGLE_CLIENT_JSON;
  const tokenStr = process.env.GOOGLE_EMAIL_TOKEN_JSON;

  if (!clientStr || !tokenStr) {
    throw new Error('Missing GOOGLE_CLIENT_JSON or GOOGLE_EMAIL_TOKEN_JSON in .env');
  }

  const clientData = JSON.parse(clientStr);
  const keys = clientData.installed || clientData.web;

  const oAuth2Client = new google.auth.OAuth2(
    keys.client_id,
    keys.client_secret,
    keys.redirect_uris ? keys.redirect_uris[0] : 'http://localhost'
  );

  const tokenData = JSON.parse(tokenStr);
  const finalToken = { ...tokenData, access_token: tokenData.access_token || tokenData.token };
  oAuth2Client.setCredentials(finalToken);
  return oAuth2Client;
}

function decodeBase64(data) {
  if (!data) return '';
  const buff = Buffer.from(data, 'base64');
  return buff.toString('utf-8');
}

function extractBody(payload) {
  let textPart = null;
  let htmlPart = null;

  function traverse(part) {
    if (part.mimeType === 'text/plain' && part.body && part.body.data) {
      textPart = part.body.data;
    } else if (part.mimeType === 'text/html' && part.body && part.body.data) {
      htmlPart = part.body.data;
    }
    if (part.parts) {
      part.parts.forEach(traverse);
    }
  }

  traverse(payload);
  if (textPart) return decodeBase64(textPart);
  if (htmlPart) return decodeBase64(htmlPart);
  return '(No readable content found)';
}

async function listEmails() {
  const CONCURRENCY_LIMIT = 5; // Only process 5 emails at a time
  const limit = pLimit(CONCURRENCY_LIMIT);

  try {
    if (mongoose.connection.readyState === 0 && process.env.MONGO_URI) {
        await mongoose.connect(process.env.MONGO_URI);
    }

    const auth = setupAuth();
    const gmail = google.gmail({ version: 'v1', auth });

    const query = 'newer_than:30d (label:INBOX OR label:SENT OR has:userlabels)';
    console.log(`Searching: ${query}`);

    const res = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 10000 });
    const messages = res.data.messages;

    if (!messages || messages.length === 0) return JSON.stringify([], null, 2);

    console.log(`Found ${messages.length} emails. Processing with concurrency: ${CONCURRENCY_LIMIT}...`);

    const processPromises = messages.map((msg) => limit(async () => {
        try {
          const existingEmail = await Email.findOne({ messageId: msg.id });

          if (existingEmail) {
             if (existingEmail.summary && existingEmail.summary.startsWith("ERROR:")) {
                 return `[SKIPPING PREVIOUSLY FAILED] ${existingEmail.subject}`;
             }
             return `From: ${existingEmail.from}\nSubject: ${existingEmail.subject}\nSummarized: ${existingEmail.summary}\n=================\n`;
          }

          const details = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
          const payload = details.data.payload;
          const headers = payload.headers;

          const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
          const from = headers.find(h => h.name === 'From')?.value || '(Unknown)';
          const date = headers.find(h => h.name === 'Date')?.value || '(Unknown Date)';
          
          let summarizedBody = "";
          let rawBody = "";

          try {
            rawBody = emailToMarkdown(extractBody(payload)).markdown;
            summarizedBody = await summarizeEmail(rawBody.slice(0, 100000)); // Reduced limit to be safe
          } catch (aiError) {
            console.error(`>> AI ERROR on ${msg.id}: ${aiError.message}`);
            summarizedBody = `ERROR: Could not summarize. ${aiError.message}`;
          }

          await Email.findOneAndUpdate(
            { messageId: msg.id },
            {
                $set: {
                    messageId: msg.id,
                    threadId: msg.threadId,
                    from: from,
                    date: date,
                    subject: subject,
                    summary: summarizedBody || "No summary generated", 
                    updatedAt: new Date()
                }
            },
            { upsert: true, new: true }
          );

          console.log(`Saved: ${subject.substring(0, 30)}...`);

          return `From: ${from}\nSubject: ${subject}\nSummarized: ${summarizedBody}\n=================\n`;

        } catch (innerErr) {
          console.error(`CRITICAL FAILURE on ${msg.id}: ${innerErr.message}`);
          return false;
        }
    }));

    const allResults = await Promise.all(processPromises);
    
    const cleanResults = allResults.filter(r => r);
    return JSON.stringify(cleanResults, null, 2).replace(/<[^>]*>/g, '');

  } catch (error) {
    console.error('Global Error:', error.message);
    return JSON.stringify(`Error: ${error.message}`, null, 2);
  }
}

async function getEmailFromQuery(customQuery) {
    try {
        const auth = setupAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.messages.list({ userId: 'me', q: customQuery, maxResults: 1 });
        const messages = res.data.messages;
    
        if (!messages || messages.length === 0) {
          return `No emails found matching query: ${customQuery}`;
        }
        
        const msgId = messages[0].id;
        const details = await gmail.users.messages.get({ userId: 'me', id: msgId, format: 'full' });
        const payload = details.data.payload;
        return extractBody(payload);
      } catch (error) {
        console.error('Error:', error.message);
        return `Error fetching email: ${error.message}`;
      }
}

module.exports = listEmails;