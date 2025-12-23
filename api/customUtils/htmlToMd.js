/*!
 * MIT License
 * * Copyright (c) 2024 HTML to Markdown Extractor
 * * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

class EmailRules {
    constructor(options) {
        this.options = options;
        this.rules = new Map();
        this.initializeRules();
    }
    getRule(tagName) {
        return this.rules.get(tagName);
    }
    initializeRules() {
        this.rules.set('div', {
            apply: (element, childContent) => {
                if (this.isEmailSignature(element)) {
                    return this.options.handleEmailSignatures ?
                        `\n\n---\n${childContent}\n` : '';
                }
                if (this.isQuotedContent(element)) {
                    return this.options.preserveEmailQuotes ?
                        this.formatQuotedContent(childContent) : '';
                }
                if (this.isOutlookDiv(element)) {
                    return this.handleOutlookDiv(element, childContent);
                }
                return childContent;
            }
        });
        this.rules.set('table', {
            apply: (element, childContent) => {
                if (this.isLayoutTable(element)) {
                    return childContent;
                }
                if (this.options.tableHandling === 'preserve') {
                    return this.convertToMarkdownTable(element);
                }
                else if (this.options.tableHandling === 'remove') {
                    return '';
                }
                return this.convertToMarkdownTable(element);
            }
        });
        this.rules.set('span', {
            apply: (element, childContent) => {
                const style = element.getAttribute('style') || '';
                if (this.options.convertInlineStyles) {
                    if (style.includes('font-weight: bold') || style.includes('font-weight:bold')) {
                        return `**${childContent}**`;
                    }
                    if (style.includes('font-style: italic') || style.includes('font-style:italic')) {
                        return `*${childContent}*`;
                    }
                    if (style.includes('text-decoration: underline')) {
                        return `<u>${childContent}</u>`;
                    }
                    if (style.includes('color:') && this.isImportantColor(style)) {
                        return `<mark>${childContent}</mark>`;
                    }
                }
                return childContent;
            }
        });
        this.rules.set('font', {
            apply: (element, childContent) => {
                const color = element.getAttribute('color');
                element.getAttribute('size');
                if (color && this.isImportantColor(`color: ${color}`)) {
                    return `<mark>${childContent}</mark>`;
                }
                return childContent;
            }
        });
        this.rules.set('a', {
            apply: (element, childContent) => {
                const href = element.getAttribute('href');
                if (!href)
                    return childContent;
                if (href.startsWith('mailto:')) {
                    const email = href.replace('mailto:', '');
                    return childContent === email ?
                        `<${email}>` : `[${childContent}](${href})`;
                }
                if (href.startsWith('tel:')) {
                    return childContent;
                }
                if (this.options.linkStyle === 'inlined') {
                    return `[${childContent}](${href})`;
                }
                return childContent;
            }
        });
        this.rules.set('blockquote', {
            apply: (element, childContent) => {
                const lines = childContent.split('\n');
                const quotedLines = lines.map(line => line.trim() ? `> ${line}` : '>');
                return `\n${quotedLines.join('\n')}\n`;
            }
        });
        this.rules.set('pre', {
            apply: (element, childContent) => {
                if (this.options.codeBlockStyle === 'fenced') {
                    return `\n${this.options.fence}\n${childContent}\n${this.options.fence}\n`;
                }
                else {
                    const lines = childContent.split('\n');
                    const indentedLines = lines.map(line => `    ${line}`);
                    return `\n${indentedLines.join('\n')}\n`;
                }
            }
        });
    }
    isEmailSignature(element) {
        const classes = element.getAttribute('class') || '';
        const id = element.getAttribute('id') || '';
        const textContent = element.textContent || '';
        const signatureIndicators = [
            'signature', 'sig', 'email-signature', 'footer',
            'sent from', 'regards', 'best regards', 'sincerely'
        ];
        return signatureIndicators.some(indicator => classes.toLowerCase().includes(indicator) ||
            id.toLowerCase().includes(indicator) ||
            textContent.toLowerCase().includes(indicator));
    }
    isQuotedContent(element) {
        const classes = element.getAttribute('class') || '';
        const style = element.getAttribute('style') || '';
        return classes.includes('quoted') ||
            classes.includes('gmail_quote') ||
            classes.includes('yahoo_quoted') ||
            style.includes('border-left') ||
            element.getAttribute('dir') === 'ltr';
    }
    formatQuotedContent(content) {
        const lines = content.split('\n');
        const quotedLines = lines.map(line => line.trim() ? `> ${line}` : '>');
        return `\n${quotedLines.join('\n')}\n`;
    }
    isOutlookDiv(element) {
        var _a;
        const classes = element.getAttribute('class') || '';
        return classes.includes('WordSection') ||
            classes.includes('MsoNormal') ||
            ((_a = element.getAttribute('style')) === null || _a === void 0 ? void 0 : _a.includes('mso-')) || false;
    }
    handleOutlookDiv(element, childContent) {
        return childContent;
    }
    isLayoutTable(element) {
        const role = element.getAttribute('role');
        const cellpadding = element.getAttribute('cellpadding');
        const cellspacing = element.getAttribute('cellspacing');
        return role === 'presentation' ||
            (cellpadding === '0' && cellspacing === '0') ||
            !this.hasDataTableStructure(element);
    }
    hasDataTableStructure(table) {
        const headers = table.querySelectorAll('th');
        const rows = table.querySelectorAll('tr');
        return headers.length > 0 && rows.length > 1;
    }
    convertToMarkdownTable(table) {
        const rows = table.querySelectorAll('tr');
        if (rows.length === 0)
            return '';
        let markdown = '\n';
        let hasHeaders = false;
        rows.forEach((row, index) => {
            const cells = row.querySelectorAll('td, th');
            const cellContents = Array.from(cells).map(cell => {
                var _a;
                const content = ((_a = cell.textContent) === null || _a === void 0 ? void 0 : _a.trim()) || '';
                return content.replace(/\|/g, '\\|');
            });
            if (index === 0 && row.querySelector('th')) {
                hasHeaders = true;
            }
            markdown += `| ${cellContents.join(' | ')} |\n`;
            if (index === 0 && (hasHeaders || this.shouldTreatAsHeaders(cellContents))) {
                const separator = cellContents.map(() => '---').join(' | ');
                markdown += `| ${separator} |\n`;
            }
        });
        return markdown + '\n';
    }
    shouldTreatAsHeaders(cellContents) {
        return cellContents.every(content => content.length < 50 &&
            /^[A-Z][a-z\s]*$/.test(content.trim()));
    }
    isImportantColor(style) {
        const importantColors = ['red', '#ff0000', '#dc3545', '#d9534f'];
        return importantColors.some(color => style.toLowerCase().includes(color.toLowerCase()));
    }
}

const SERVER_NODE_TYPES$3 = {
    ELEMENT_NODE: 1,
    TEXT_NODE: 3,
    COMMENT_NODE: 8,
    DOCUMENT_NODE: 9,
    DOCUMENT_FRAGMENT_NODE: 11
};
class BaseRules {
    constructor(options) {
        this.ruleCache = new Map();
        this.nodeTypes = SERVER_NODE_TYPES$3;
        this.options = options;
        this.rules = new Map();
        this.initializeRules();
    }
    getRule(tagName) {
        if (this.ruleCache.has(tagName)) {
            return this.ruleCache.get(tagName);
        }
        const rule = this.rules.get(tagName);
        this.ruleCache.set(tagName, rule);
        return rule;
    }
    clearCache() {
        this.ruleCache.clear();
    }
    initializeRules() {
        for (let i = 1; i <= 6; i++) {
            this.rules.set(`h${i}`, {
                apply: (element, childContent) => {
                    const level = '#'.repeat(i);
                    const content = childContent.trim();
                    return `\n${level} ${content}\n\n`;
                }
            });
        }
        this.rules.set('p', {
            apply: (element, childContent) => {
                const content = childContent.trim();
                if (!content)
                    return '';
                return `\n${content}\n\n`;
            }
        });
        this.rules.set('br', {
            apply: (element, childContent) => {
                return '\n';
            }
        });
        this.rules.set('hr', {
            apply: (element, childContent) => {
                return '\n---\n\n';
            }
        });
        this.rules.set('strong', {
            apply: (element, childContent) => {
                if (!childContent.trim())
                    return '';
                return `${this.options.strongDelimiter}${childContent.trim()}${this.options.strongDelimiter}`;
            }
        });
        this.rules.set('b', {
            apply: (element, childContent) => {
                if (!childContent.trim())
                    return '';
                return `${this.options.strongDelimiter}${childContent.trim()}${this.options.strongDelimiter}`;
            }
        });
        this.rules.set('em', {
            apply: (element, childContent) => {
                if (!childContent.trim())
                    return '';
                return `${this.options.emDelimiter}${childContent.trim()}${this.options.emDelimiter}`;
            }
        });
        this.rules.set('i', {
            apply: (element, childContent) => {
                if (!childContent.trim())
                    return '';
                return `${this.options.emDelimiter}${childContent.trim()}${this.options.emDelimiter}`;
            }
        });
        this.rules.set('code', {
            apply: (element, childContent) => {
                var _a;
                if (!childContent.trim())
                    return '';
                const content = childContent.trim();
                let parent = element.parentElement;
                while (parent) {
                    if (((_a = parent.tagName) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === 'pre') {
                        return content;
                    }
                    parent = parent.parentElement;
                }
                if (content.includes('`')) {
                    return `\`\`${content}\`\``;
                }
                return `\`${content}\``;
            }
        });
        this.rules.set('pre', {
            apply: (element, childContent) => {
                const content = childContent.trim();
                if (!content)
                    return '';
                const codeElement = element.querySelector ? element.querySelector('code') : null;
                let language = '';
                if (codeElement === null || codeElement === void 0 ? void 0 : codeElement.getAttribute) {
                    const className = codeElement.getAttribute('class') || '';
                    const match = className.match(/language-(\w+)/);
                    if (match) {
                        language = match[1];
                    }
                }
                if (this.options.codeBlockStyle === 'indented') {
                    const lines = content.split('\n');
                    const indentedLines = lines.map(line => `    ${line}`);
                    return `\n${indentedLines.join('\n')}\n\n`;
                }
                else {
                    return `\n\`\`\`${language}\n${content}\n\`\`\`\n\n`;
                }
            }
        });
        this.rules.set('a', {
            apply: (element, childContent) => {
                const href = element.getAttribute ? element.getAttribute('href') : null;
                const title = element.getAttribute ? element.getAttribute('title') : null;
                if (!href)
                    return childContent;
                if (!childContent.trim())
                    return '';
                if (href.startsWith('mailto:')) {
                    const email = href.replace('mailto:', '').split('?')[0];
                    if (childContent.trim() === email) {
                        return `<${email}>`;
                    }
                }
                if (this.options.linkStyle === 'inlined') {
                    if (title) {
                        return `[${childContent.trim()}](${href} "${title}")`;
                    }
                    return `[${childContent.trim()}](${href})`;
                }
                return `[${childContent.trim()}](${href})`;
            }
        });
        this.rules.set('img', {
            apply: (element, childContent) => {
                const src = element.getAttribute ? (element.getAttribute('src') || '') : '';
                const alt = element.getAttribute ? (element.getAttribute('alt') || '') : '';
                const title = element.getAttribute ? element.getAttribute('title') : null;
                if (title) {
                    return `![${alt}](${src} "${title}")`;
                }
                return `![${alt}](${src})`;
            }
        });
        this.rules.set('ul', {
            apply: (element, childContent) => {
                const content = childContent.trim();
                if (!content)
                    return '';
                return `\n${content}\n`;
            }
        });
        this.rules.set('ol', {
            apply: (element, childContent) => {
                const content = childContent.trim();
                if (!content)
                    return '';
                return `\n${content}\n`;
            }
        });
        this.rules.set('li', {
            apply: (element, childContent) => {
                var _a;
                const content = childContent.trim();
                if (!content)
                    return '';
                const parent = element.parentElement;
                const isOrdered = ((_a = parent === null || parent === void 0 ? void 0 : parent.tagName) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === 'ol';
                if (isOrdered && parent) {
                    const siblings = parent.children ? Array.from(parent.children) : [];
                    const index = siblings.indexOf(element) + 1;
                    return `${index}. ${content}\n`;
                }
                else {
                    const marker = this.options.bulletListMarker || '-';
                    return `${marker} ${content}\n`;
                }
            }
        });
        this.rules.set('blockquote', {
            apply: (element, childContent) => {
                var _a;
                const content = childContent.trim();
                if (!content)
                    return '';
                let nestingLevel = 0;
                let parent = element.parentElement;
                while (parent) {
                    if (((_a = parent.tagName) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === 'blockquote') {
                        nestingLevel++;
                    }
                    parent = parent.parentElement;
                }
                const prefix = '> '.repeat(nestingLevel + 1);
                const lines = content.split('\n');
                const quotedLines = lines.map(line => line.trim() ? `${prefix}${line}` : prefix.trim());
                return `\n${quotedLines.join('\n')}\n\n`;
            }
        });
        this.rules.set('table', {
            apply: (element, childContent) => {
                return this.convertTable(element);
            }
        });
        this.rules.set('tr', {
            apply: (element, childContent) => childContent
        });
        this.rules.set('td', {
            apply: (element, childContent) => childContent
        });
        this.rules.set('th', {
            apply: (element, childContent) => childContent
        });
        this.rules.set('div', {
            apply: (element, childContent) => {
                const content = childContent.trim();
                if (!content)
                    return '';
                return `${content}\n`;
            }
        });
        this.rules.set('span', {
            apply: (element, childContent) => childContent
        });
        this.rules.set('del', {
            apply: (element, childContent) => {
                if (!childContent.trim())
                    return '';
                return `~~${childContent.trim()}~~`;
            }
        });
        this.rules.set('s', {
            apply: (element, childContent) => {
                if (!childContent.trim())
                    return '';
                return `~~${childContent.trim()}~~`;
            }
        });
        this.rules.set('ins', {
            apply: (element, childContent) => {
                if (!childContent.trim())
                    return '';
                return `<ins>${childContent.trim()}</ins>`;
            }
        });
        this.rules.set('u', {
            apply: (element, childContent) => {
                if (!childContent.trim())
                    return '';
                return `<u>${childContent.trim()}</u>`;
            }
        });
        this.rules.set('small', {
            apply: (element, childContent) => {
                if (!childContent.trim())
                    return '';
                return `<small>${childContent.trim()}</small>`;
            }
        });
        this.rules.set('sub', {
            apply: (element, childContent) => {
                if (!childContent.trim())
                    return '';
                return `<sub>${childContent.trim()}</sub>`;
            }
        });
        this.rules.set('sup', {
            apply: (element, childContent) => {
                if (!childContent.trim())
                    return '';
                return `<sup>${childContent.trim()}</sup>`;
            }
        });
    }
    convertTable(table) {
        if (!table.querySelectorAll)
            return '';
        const rows = table.querySelectorAll('tr');
        if (rows.length === 0)
            return '';
        let markdown = '\n';
        let hasHeaders = false;
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
            const row = rows[rowIndex];
            const cells = row.querySelectorAll ? row.querySelectorAll('td, th') : [];
            const cellContents = [];
            for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
                const cell = cells[cellIndex];
                let content = this.getCellContent(cell);
                content = content.replace(/\|/g, '\\|');
                content = content.replace(/\n/g, ' ');
                content = content.trim();
                cellContents.push(content || ' ');
            }
            if (cellContents.length === 0)
                continue;
            if (rowIndex === 0 && row.querySelector && row.querySelector('th')) {
                hasHeaders = true;
            }
            const cellsFormatted = cellContents.map(cell => cell === ' ' ? ' ' : cell);
            markdown += `| ${cellsFormatted.join(' | ')} |\n`;
            if (rowIndex === 0 && (hasHeaders || this.looksLikeHeaders(cellContents))) {
                const separator = cellContents.map(() => '---').join(' | ');
                markdown += `| ${separator} |\n`;
            }
        }
        return markdown + '\n';
    }
    getCellContent(cell) {
        var _a;
        let content = '';
        const childNodes = cell.childNodes || [];
        for (let i = 0; i < childNodes.length; i++) {
            const node = childNodes[i];
            if (node.nodeType === this.nodeTypes.TEXT_NODE) {
                content += node.textContent || '';
            }
            else if (node.nodeType === this.nodeTypes.ELEMENT_NODE) {
                const element = node;
                const tagName = ((_a = element.tagName) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
                if (tagName === 'strong' || tagName === 'b') {
                    content += `**${element.textContent || ''}**`;
                }
                else if (tagName === 'em' || tagName === 'i') {
                    content += `*${element.textContent || ''}*`;
                }
                else if (tagName === 'code') {
                    content += `\`${element.textContent || ''}\``;
                }
                else {
                    content += element.textContent || '';
                }
            }
        }
        return content;
    }
    looksLikeHeaders(cellContents) {
        return cellContents.every(content => {
            const trimmed = content.trim();
            return trimmed.length > 0 &&
                trimmed.length < 50 &&
                /^[A-Z]/.test(trimmed);
        });
    }
}

const SERVER_NODE_TYPES$2 = {
    ELEMENT_NODE: 1,
    TEXT_NODE: 3,
    COMMENT_NODE: 8,
    DOCUMENT_NODE: 9
};
class DOMUtils {
    constructor() {
        this.nodeTypes = SERVER_NODE_TYPES$2;
    }
    parseHTML(html) {
        if (this.isJSDOMAvailable()) {
            return this.parseWithJSDOM(html);
        }
        return this.parseWithBasicParser(html);
    }
    isJSDOMAvailable() {
        try {
            require.resolve('jsdom');
            return true;
        }
        catch (_a) {
            return false;
        }
    }
    parseWithJSDOM(html) {
        const { JSDOM } = require('jsdom');
        const dom = new JSDOM(html);
        return dom.window.document;
    }
    parseWithBasicParser(html) {
        const textContent = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        return {
            body: {
                nodeType: this.nodeTypes.ELEMENT_NODE,
                tagName: 'BODY',
                textContent: textContent,
                innerHTML: html,
                childNodes: [{
                        nodeType: this.nodeTypes.TEXT_NODE,
                        textContent: textContent,
                        parentNode: null,
                        parentElement: null
                    }],
                querySelector: () => null,
                querySelectorAll: () => [],
                getAttribute: () => null,
                hasAttribute: () => false
            },
            querySelector: () => null,
            querySelectorAll: () => []
        };
    }
    getTextContent(element) {
        return element.textContent || element.innerText || '';
    }
    hasAttribute(element, attr) {
        return element.hasAttribute ? element.hasAttribute(attr) : false;
    }
    getAttribute(element, attr) {
        return element.getAttribute ? element.getAttribute(attr) : null;
    }
    isElementNode(node) {
        return node.nodeType === this.nodeTypes.ELEMENT_NODE;
    }
    isTextNode(node) {
        return node.nodeType === this.nodeTypes.TEXT_NODE;
    }
}

class EmailUtils {
    detectEmailContext(document) {
        const context = {
            isEmailContent: false,
            hasEmailHeaders: false,
            hasSignature: false,
            hasQuotedContent: false,
            clientType: 'other'
        };
        const emailIndicators = [
            '[id*="gmail"]', '[class*="gmail"]',
            '[id*="outlook"]', '[class*="outlook"]', '[class*="mso"]',
            '[class*="yahoo"]', '[id*="yahoo"]',
            '[class*="signature"]', '[class*="quoted"]',
            'blockquote[type="cite"]',
            '[class*="email"]', '[id*="email"]'
        ];
        context.isEmailContent = emailIndicators.some(selector => document.querySelector(selector) !== null);
        if (!context.isEmailContent) {
            context.isEmailContent = this.detectEmailByContent(document);
        }
        context.hasEmailHeaders = this.hasEmailHeaders(document);
        context.hasSignature = this.hasSignature(document);
        context.hasQuotedContent = this.hasQuotedContent(document);
        context.clientType = this.detectClientType(document);
        return context;
    }
    detectEmailByContent(document) {
        var _a, _b;
        const bodyText = ((_b = (_a = document.body) === null || _a === void 0 ? void 0 : _a.textContent) === null || _b === void 0 ? void 0 : _b.toLowerCase()) || '';
        const emailPhrases = [
            'from:', 'to:', 'subject:', 'sent from', 'best regards',
            'sincerely', 'kind regards', 'thanks', 'forwarded message',
            'original message', 'reply to', 'cc:', 'bcc:'
        ];
        return emailPhrases.some(phrase => bodyText.includes(phrase));
    }
    hasEmailHeaders(document) {
        const headerSelectors = [
            '[id*="header"]', '[class*="header"]',
            '[class*="from"]', '[class*="to"]', '[class*="subject"]',
            '[class*="date"]', '[class*="sender"]'
        ];
        if (headerSelectors.some(selector => document.querySelector(selector))) {
            return true;
        }
        const metaTags = document.querySelectorAll('meta[name*="email"], meta[property*="email"]');
        return metaTags.length > 0;
    }
    hasSignature(document) {
        var _a;
        const signatureSelectors = [
            '[class*="signature"]', '[id*="signature"]',
            '[class*="sig"]', '[id*="sig"]',
            '[class*="footer"]', '[id*="footer"]'
        ];
        if (signatureSelectors.some(selector => document.querySelector(selector))) {
            return true;
        }
        const bodyText = ((_a = document.body) === null || _a === void 0 ? void 0 : _a.textContent) || '';
        const signaturePatterns = [
            /best regards,?\s*\n/i,
            /sincerely,?\s*\n/i,
            /kind regards,?\s*\n/i,
            /sent from my \w+/i,
            /--\s*\n/
        ];
        return signaturePatterns.some(pattern => pattern.test(bodyText));
    }
    hasQuotedContent(document) {
        var _a;
        const quotedSelectors = [
            'blockquote', '[class*="quoted"]', '[class*="gmail_quote"]',
            '[class*="yahoo_quoted"]', '[dir="ltr"]', '[class*="quote"]',
            '[id*="quote"]'
        ];
        if (quotedSelectors.some(selector => document.querySelector(selector))) {
            return true;
        }
        const bodyText = ((_a = document.body) === null || _a === void 0 ? void 0 : _a.textContent) || '';
        return /^>\s/m.test(bodyText) || /wrote:$/m.test(bodyText);
    }
    detectClientType(document) {
        var _a, _b;
        const detectionRules = [
            { type: 'gmail', selectors: ['[class*="gmail"]', '[id*="gmail"]'] },
            { type: 'outlook', selectors: ['[class*="outlook"]', '[class*="mso"]', '.WordSection'] },
            { type: 'yahoo', selectors: ['[class*="yahoo"]', '[id*="yahoo"]'] },
            { type: 'apple', selectors: ['[class*="apple"]', '[id*="applemail"]'] },
            { type: 'thunderbird', selectors: ['[class*="thunderbird"]', '[class*="moz"]'] }
        ];
        for (const rule of detectionRules) {
            if (rule.selectors.some(selector => document.querySelector(selector))) {
                return rule.type;
            }
        }
        const generator = (_b = (_a = document.querySelector('meta[name="generator"]')) === null || _a === void 0 ? void 0 : _a.getAttribute('content')) === null || _b === void 0 ? void 0 : _b.toLowerCase();
        if (generator) {
            if (generator.includes('outlook'))
                return 'outlook';
            if (generator.includes('apple'))
                return 'apple';
            if (generator.includes('thunderbird'))
                return 'thunderbird';
        }
        return 'other';
    }
    extractEmailHeaders(document) {
        const headers = {};
        headers.from = this.extractHeaderValue(document, ['from', 'sender']);
        headers.subject = this.extractHeaderValue(document, ['subject']);
        headers.date = this.extractHeaderValue(document, ['date', 'sent']);
        const to = this.extractHeaderValue(document, ['to', 'recipient']);
        if (to)
            headers.to = this.parseEmailList(to);
        const cc = this.extractHeaderValue(document, ['cc']);
        if (cc)
            headers.cc = this.parseEmailList(cc);
        const bcc = this.extractHeaderValue(document, ['bcc']);
        if (bcc)
            headers.bcc = this.parseEmailList(bcc);
        if (!headers.from && !headers.subject) {
            this.extractHeadersFromText(document, headers);
        }
        return headers;
    }
    extractHeaderValue(document, fieldNames) {
        var _a, _b, _c;
        for (const fieldName of fieldNames) {
            let element = document.querySelector(`[class*="${fieldName}"]`);
            if (element)
                return (_a = element.textContent) === null || _a === void 0 ? void 0 : _a.trim();
            element = document.querySelector(`[id*="${fieldName}"]`);
            if (element)
                return (_b = element.textContent) === null || _b === void 0 ? void 0 : _b.trim();
            element = document.querySelector(`[data-${fieldName}]`);
            if (element)
                return (_c = element.getAttribute(`data-${fieldName}`)) === null || _c === void 0 ? void 0 : _c.trim();
        }
        return undefined;
    }
    parseEmailList(emailString) {
        return emailString
            .split(/[,;]/)
            .map(email => email.trim().replace(/[<>]/g, ''))
            .filter(email => email.includes('@'));
    }
    extractHeadersFromText(document, headers) {
        var _a;
        const text = ((_a = document.body) === null || _a === void 0 ? void 0 : _a.textContent) || '';
        const patterns = [
            { field: 'from', regex: /from:\s*([^\n]+)/i },
            { field: 'to', regex: /to:\s*([^\n]+)/i },
            { field: 'subject', regex: /subject:\s*([^\n]+)/i },
            { field: 'date', regex: /date:\s*([^\n]+)/i },
            { field: 'sent', regex: /sent:\s*([^\n]+)/i }
        ];
        for (const pattern of patterns) {
            const match = text.match(pattern.regex);
            if (match) {
                const value = match[1].trim();
                if (pattern.field === 'from' && !headers.from) {
                    headers.from = value;
                }
                else if (pattern.field === 'to' && !headers.to) {
                    headers.to = this.parseEmailList(value);
                }
                else if (pattern.field === 'subject' && !headers.subject) {
                    headers.subject = value;
                }
                else if ((pattern.field === 'date' || pattern.field === 'sent') && !headers.date) {
                    headers.date = value;
                }
            }
        }
    }
    processOutlookHTML(html) {
        let processed = html;
        processed = processed.replace(/<\?xml[^>]*>/gi, '');
        processed = processed.replace(/xmlns:[^=]*="[^"]*"/gi, '');
        processed = processed.replace(/<o:p[^>]*>/gi, '<p>');
        processed = processed.replace(/<\/o:p>/gi, '</p>');
        processed = processed.replace(/<!--\[if[^>]*>[\s\S]*?<!\[endif\]-->/gi, '');
        processed = processed.replace(/\bmso-[^;:]+:[^;]+;?/gi, '');
        processed = processed.replace(/\b-webkit-[^;:]+:[^;]+;?/gi, '');
        processed = processed.replace(/<div[^>]*class="?WordSection\d*"?[^>]*>/gi, '<div>');
        processed = processed.replace(/<p[^>]*class="?MsoNormal"?[^>]*>/gi, '<p>');
        processed = processed.replace(/<span[^>]*mso[^>]*>\s*<\/span>/gi, '');
        return processed;
    }
    isInlineImage(img) {
        const src = img.getAttribute('src') || '';
        if (src.startsWith('cid:'))
            return true;
        if (src.startsWith('data:'))
            return true;
        if (src.startsWith('blob:'))
            return true;
        if (src.includes('image001') || src.includes('image002'))
            return true;
        return false;
    }
    extractQuotedContent(element) {
        var _a;
        const content = ((_a = element.textContent) === null || _a === void 0 ? void 0 : _a.trim()) || '';
        const attributionPatterns = [
            /On .+?, .+ wrote:/i,
            /From: .+/i,
            /.+ wrote:/i,
            /Sent from .+/i
        ];
        let attribution;
        for (const pattern of attributionPatterns) {
            const match = content.match(pattern);
            if (match) {
                attribution = match[0];
                break;
            }
        }
        return { content, attribution };
    }
    cleanEmailSignature(signature) {
        let cleaned = signature;
        cleaned = cleaned.replace(/^--\s*$/gm, '');
        cleaned = cleaned.replace(/^_+$/gm, '');
        cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
        cleaned = cleaned.trim();
        return cleaned;
    }
    parseEmailAddress(emailString) {
        const match = emailString.match(/^(.+?)\s*<([^>]+)>$/) ||
            emailString.match(/^([^@]+@[^@]+)$/);
        if (match) {
            if (match.length === 3) {
                return { name: match[1].trim(), email: match[2].trim() };
            }
            else {
                return { email: match[1].trim() };
            }
        }
        return { email: emailString.trim() };
    }
}

class TextUtils {
    escapeMarkdown(text) {
        if (!text)
            return text;
        let escaped = text;
        escaped = escaped.replace(/\\/g, '\\\\');
        if (!escaped.includes('**') && !escaped.includes('*')) {
            escaped = escaped.replace(/\*/g, '\\*');
        }
        if (!escaped.includes('__') && !escaped.includes('_')) {
            escaped = escaped.replace(/_/g, '\\_');
        }
        if (!escaped.includes('```') && !escaped.includes('`')) {
            escaped = escaped.replace(/`/g, '\\`');
        }
        escaped = escaped.replace(/^#/gm, '\\#');
        escaped = escaped.replace(/^>/gm, '\\>');
        escaped = escaped.replace(/^\+/gm, '\\+');
        escaped = escaped.replace(/^-/gm, '\\-');
        escaped = escaped.replace(/^\*/gm, '\\*');
        escaped = escaped.replace(/^\d+\./gm, (match) => match.replace('.', '\\.'));
        return escaped;
    }
    getCachedRegex(pattern, flags) {
        const key = `${pattern}|${flags || ''}`;
        let regex = TextUtils.regexCache.get(key);
        if (!regex) {
            regex = new RegExp(pattern, flags);
            TextUtils.regexCache.set(key, regex);
        }
        return regex;
    }
    static clearRegexCache() {
        TextUtils.regexCache.clear();
    }
    unescapeMarkdown(text) {
        if (!text)
            return text;
        return text.replace(/\\([\\`*_{}[\]()#+\-.!|~])/g, '$1');
    }
    decodeHTMLEntities(html) {
        const entities = {
            '&amp;': '&',
            '&lt;': '<',
            '&gt;': '>',
            '&quot;': '"',
            '&#39;': "'",
            '&apos;': "'",
            '&nbsp;': ' ',
            '&hellip;': '...',
            '&mdash;': '—',
            '&ndash;': '–',
            '&rsquo;': "'",
            '&lsquo;': "'",
            '&rdquo;': '"',
            '&ldquo;': '"',
            '&copy;': '©',
            '&reg;': '®',
            '&trade;': '™',
            '&sect;': '§',
            '&para;': '¶',
            '&dagger;': '†',
            '&Dagger;': '‡',
            '&bull;': '•',
            '&prime;': '′',
            '&Prime;': '″',
            '&oline;': '‾',
            '&frasl;': '⁄',
            '&weierp;': '℘',
            '&image;': 'ℑ',
            '&real;': 'ℜ',
            '&alefsym;': 'ℵ'
        };
        let decoded = html;
        for (const [entity, replacement] of Object.entries(entities)) {
            decoded = decoded.replace(new RegExp(entity, 'g'), replacement);
        }
        decoded = decoded.replace(/&#(\d+);/g, (match, num) => {
            const code = parseInt(num, 10);
            return code > 0 && code <= 1114111 ? String.fromCharCode(code) : match;
        });
        decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (match, hex) => {
            const code = parseInt(hex, 16);
            return code > 0 && code <= 1114111 ? String.fromCharCode(code) : match;
        });
        return decoded;
    }
    encodeHTMLEntities(text) {
        const entities = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return text.replace(/[&<>"']/g, char => entities[char] || char);
    }
    fixMarkdownFormatting(markdown) {
        let fixed = markdown;
        fixed = fixed.replace(/^(#{1,6})\s*(.+)$/gm, '$1 $2');
        fixed = fixed.replace(/\*\*([^*\n]+)\*\*/g, '**$1**');
        fixed = fixed.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '*$1*');
        fixed = fixed.replace(/```(\w*)\n([\s\S]*?)\n```/g, '```$1\n$2\n```');
        fixed = fixed.replace(/[ \t]+$/gm, '');
        fixed = fixed.replace(/\n{4,}/g, '\n\n\n');
        fixed = fixed.replace(/\n(#{1,6}\s)/g, '\n\n$1');
        fixed = fixed.replace(/(#{1,6}\s[^\n]+)\n(?!\n)/g, '$1\n\n');
        return fixed;
    }
    normalizeWhitespace(text) {
        return text
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n\s*\n/g, '\n\n')
            .trim();
    }
    truncateText(text, maxLength, suffix = '...') {
        if (text.length <= maxLength) {
            return text;
        }
        return text.slice(0, maxLength - suffix.length) + suffix;
    }
    slugify(text) {
        return text
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/[\s_-]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }
    capitalize(text) {
        return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    }
    isWhitespaceOnly(text) {
        return /^\s*$/.test(text);
    }
    countWords(text) {
        return text.trim().split(/\s+/).filter(word => word.length > 0).length;
    }
    extractUrls(text) {
        const urlRegex = /https?:\/\/[^\s<>"]+/g;
        return text.match(urlRegex) || [];
    }
    extractEmails(text) {
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        return text.match(emailRegex) || [];
    }
    removeExcessiveSpacing(text) {
        return text
            .replace(/[ \t]{2,}/g, ' ')
            .replace(/\n[ \t]*/g, '\n')
            .replace(/\n{3,}/g, '\n\n');
    }
    indentText(text, spaces = 2) {
        const indent = ' '.repeat(spaces);
        return text.split('\n').map(line => indent + line).join('\n');
    }
    wrapText(text, width = 80) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';
        for (const word of words) {
            if (currentLine.length + word.length + 1 <= width) {
                currentLine += (currentLine ? ' ' : '') + word;
            }
            else {
                if (currentLine) {
                    lines.push(currentLine);
                }
                currentLine = word;
            }
        }
        if (currentLine) {
            lines.push(currentLine);
        }
        return lines.join('\n');
    }
}
TextUtils.regexCache = new Map();

class CustomRules {
    constructor(customRules = []) {
        this.rules = new Map();
        this.globalRules = [];
        this.initializeRules(customRules);
    }
    getRule(tagName) {
        const tagRules = this.rules.get(tagName) || [];
        const allRules = [...tagRules, ...this.globalRules];
        if (allRules.length === 0) {
            return undefined;
        }
        allRules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        return allRules[0];
    }
    addRule(rule) {
        const compiledRule = this.compileRule(rule);
        if (rule.selector === '*') {
            this.globalRules.push(compiledRule);
        }
        else {
            const tagName = this.parseSelector(rule.selector);
            if (!this.rules.has(tagName)) {
                this.rules.set(tagName, []);
            }
            this.rules.get(tagName).push(compiledRule);
        }
    }
    removeRule(selector) {
        if (selector === '*') {
            this.globalRules = [];
        }
        else {
            const tagName = this.parseSelector(selector);
            this.rules.delete(tagName);
        }
    }
    clearRules() {
        this.rules.clear();
        this.globalRules = [];
    }
    initializeRules(customRules) {
        customRules.forEach(rule => this.addRule(rule));
    }
    compileRule(rule) {
        return {
            apply: (element, childContent) => {
                if (typeof rule.replacement === 'string') {
                    return this.processStringReplacement(rule.replacement, element, childContent);
                }
                else {
                    return rule.replacement(childContent, element, {});
                }
            },
            priority: rule.priority || 0
        };
    }
    processStringReplacement(replacement, element, childContent) {
        let result = replacement;
        result = result.replace(/\$\{content\}/g, childContent);
        result = result.replace(/\$\{text\}/g, element.textContent || '');
        result = result.replace(/\$\{(\w+)\}/g, (match, attrName) => {
            return element.getAttribute(attrName) || '';
        });
        return result;
    }
    parseSelector(selector) {
        const match = selector.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
        return match ? match[1].toLowerCase() : selector.toLowerCase();
    }
}

const SERVER_NODE_TYPES$1 = {
    ELEMENT_NODE: 1,
    TEXT_NODE: 3,
    COMMENT_NODE: 8,
    DOCUMENT_NODE: 9,
    DOCUMENT_FRAGMENT_NODE: 11
};
class Converter {
    constructor(options) {
        this.nodeTypes = SERVER_NODE_TYPES$1;
        this.processedNodes = new WeakSet();
        this.options = options;
        this.baseRules = new BaseRules(options);
        this.emailRules = new EmailRules(options);
        this.customRules = new CustomRules(options.customRules || []);
        this.textUtils = new TextUtils();
        this.domUtils = new DOMUtils();
        this.linkReferences = new Map();
        this.linkCounter = 1;
    }
    convertNode(node, isEmailContent = false) {
        if (this.processedNodes.has(node)) {
            return '';
        }
        this.processedNodes.add(node);
        if (node.nodeType === this.nodeTypes.TEXT_NODE) {
            return this.convertTextNode(node);
        }
        if (node.nodeType === this.nodeTypes.ELEMENT_NODE) {
            return this.convertElementNode(node, isEmailContent);
        }
        if (node.nodeType === this.nodeTypes.COMMENT_NODE) {
            return '';
        }
        return '';
    }
    convertTextNode(textNode) {
        let text = textNode.textContent || '';
        if (!this.options.preserveWhitespace) {
            text = text.replace(/[ \t]+/g, ' ');
            const parent = textNode.parentElement;
            if (parent && this.isBlockElement(parent)) {
                text = text.replace(/^\s+|\s+$/g, '');
            }
        }
        if (!text || (this.options.preserveWhitespace && /^\s*$/.test(text))) {
            return text;
        }
        return this.options.preserveWhitespace ? text : this.textUtils.escapeMarkdown(text);
    }
    convertElementNode(element, isEmailContent) {
        var _a, _b;
        const tagName = ((_a = element.tagName) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || 'div';
        if ((_b = this.options.ignoreElements) === null || _b === void 0 ? void 0 : _b.includes(tagName)) {
            return '';
        }
        const childContent = this.processChildren(element, isEmailContent);
        const customRule = this.customRules.getRule(tagName);
        if (customRule) {
            return this.applyRule(customRule, element, childContent);
        }
        if (isEmailContent) {
            const emailRule = this.emailRules.getRule(tagName);
            if (emailRule) {
                return this.applyRule(emailRule, element, childContent);
            }
        }
        const baseRule = this.baseRules.getRule(tagName);
        if (baseRule) {
            return this.applyRule(baseRule, element, childContent);
        }
        return childContent;
    }
    applyRule(rule, element, childContent) {
        try {
            return rule.apply(element, childContent);
        }
        catch (error) {
            console.warn(`Error applying rule for ${element.tagName}:`, error);
            return childContent;
        }
    }
    processChildren(element, isEmailContent) {
        const children = element.childNodes || [];
        const results = [];
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (this.processedNodes.has(child)) {
                continue;
            }
            const converted = this.convertNode(child, isEmailContent);
            if (converted) {
                if (!this.options.preserveWhitespace && i > 0 && this.needsSpacing(children[i - 1], child)) {
                    results.push(' ');
                }
                results.push(converted);
            }
        }
        return results.join('');
    }
    needsSpacing(prevNode, currentNode) {
        if (prevNode.nodeType === this.nodeTypes.ELEMENT_NODE &&
            currentNode.nodeType === this.nodeTypes.ELEMENT_NODE) {
            const prevIsInline = this.isInlineElement(prevNode);
            const currentIsInline = this.isInlineElement(currentNode);
            return prevIsInline && currentIsInline;
        }
        return false;
    }
    isBlockElement(element) {
        var _a;
        const blockElements = [
            'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'blockquote', 'pre', 'ul', 'ol', 'li', 'table',
            'tr', 'td', 'th', 'thead', 'tbody', 'tfoot',
            'section', 'article', 'header', 'footer', 'main',
            'aside', 'nav', 'form', 'fieldset', 'hr'
        ];
        const tagName = ((_a = element.tagName) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
        return blockElements.includes(tagName);
    }
    isInlineElement(element) {
        var _a;
        const inlineElements = [
            'span', 'a', 'strong', 'b', 'em', 'i', 'u', 's',
            'strike', 'del', 'ins', 'mark', 'small', 'sub',
            'sup', 'code', 'kbd', 'samp', 'var', 'abbr',
            'acronym', 'cite', 'dfn', 'time', 'img'
        ];
        const tagName = ((_a = element.tagName) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
        return inlineElements.includes(tagName);
    }
    reset() {
        this.linkReferences.clear();
        this.linkCounter = 1;
        this.processedNodes = new WeakSet();
    }
    setOptions(options) {
        this.options = { ...this.options, ...options };
    }
    cleanup() {
        var _a;
        this.linkReferences.clear();
        this.linkCounter = 1;
        this.processedNodes = new WeakSet();
        if ((_a = this.baseRules) === null || _a === void 0 ? void 0 : _a.clearCache) {
            this.baseRules.clearCache();
        }
        if (TextUtils.clearRegexCache) {
            TextUtils.clearRegexCache();
        }
    }
}

const SERVER_NODE_TYPES = {
    ELEMENT_NODE: 1,
    TEXT_NODE: 3,
    COMMENT_NODE: 8,
    DOCUMENT_NODE: 9,
    DOCUMENT_FRAGMENT_NODE: 11
};
class HTMLToMDParser {
    constructor(options = {}) {
        this.nodeTypes = SERVER_NODE_TYPES;
        this.options = {
            preserveWhitespace: false,
            trimWhitespace: true,
            bulletListMarker: '-',
            codeBlockStyle: 'fenced',
            fence: '```',
            emDelimiter: '*',
            strongDelimiter: '**',
            linkStyle: 'inlined',
            linkReferenceStyle: 'full',
            preserveEmailHeaders: true,
            handleEmailSignatures: true,
            convertInlineStyles: true,
            preserveEmailQuotes: true,
            handleOutlookSpecific: true,
            extractPlainTextFallback: false,
            tableHandling: 'convert',
            maxTableWidth: 120,
            ...options
        };
        this.domUtils = new DOMUtils();
        this.emailUtils = new EmailUtils();
        this.textUtils = new TextUtils();
        this.baseRules = new BaseRules(this.options);
        this.emailRules = new EmailRules(this.options);
        this.converter = new Converter(this.options);
        this.emailContext = this.initializeEmailContext();
    }
    convert(html) {
        try {
            const cleanedHtml = this.preprocessHTML(html);
            const document = this.domUtils.parseHTML(cleanedHtml);
            this.emailContext = this.emailUtils.detectEmailContext(document);
            const metadata = this.extractMetadata(document);
            const markdown = this.converter.convertNode(document.body || document, this.emailContext.isEmailContent);
            const finalMarkdown = this.postProcess(markdown);
            return {
                markdown: finalMarkdown,
                metadata
            };
        }
        catch (error) {
            throw new Error(`HTML to Markdown conversion failed: ${error.message}`);
        }
        finally {
            this.cleanup();
        }
    }
    cleanup() {
        if (this.converter) {
            this.converter.cleanup();
        }
        this.emailContext = this.initializeEmailContext();
    }
    preprocessHTML(html) {
        let processed = html;
        processed = processed.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
        if (this.options.handleOutlookSpecific) {
            processed = this.emailUtils.processOutlookHTML(processed);
        }
        processed = this.textUtils.decodeHTMLEntities(processed);
        if (!this.options.preserveWhitespace) {
            processed = processed.replace(/\s+/g, ' ').trim();
        }
        return processed;
    }
    extractMetadata(document) {
        var _a;
        const metadata = {};
        const titleElement = this.findElement(document, 'title');
        if (titleElement) {
            metadata.title = (_a = titleElement.textContent) === null || _a === void 0 ? void 0 : _a.trim();
        }
        if (this.options.preserveEmailHeaders && this.emailContext.hasEmailHeaders) {
            metadata.emailHeaders = this.emailUtils.extractEmailHeaders(document);
        }
        metadata.images = this.extractImages(document);
        metadata.links = this.extractLinks(document);
        return metadata;
    }
    findElement(document, tagName) {
        if (document.querySelector) {
            return document.querySelector(tagName);
        }
        const searchElement = (element) => {
            var _a;
            if (((_a = element.tagName) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === tagName.toLowerCase()) {
                return element;
            }
            const children = element.childNodes || element.children || [];
            for (let i = 0; i < children.length; i++) {
                const found = this.searchElement(children[i]);
                if (found)
                    return found;
            }
            return null;
        };
        return searchElement(document);
    }
    searchElement(element) {
        if (!element || element.nodeType !== this.nodeTypes.ELEMENT_NODE) {
            return null;
        }
        const children = element.childNodes || element.children || [];
        for (let i = 0; i < children.length; i++) {
            const result = this.searchElement(children[i]);
            if (result)
                return result;
        }
        return null;
    }
    findAllElements(document, tagName) {
        const results = [];
        if (document.querySelectorAll) {
            const elements = document.querySelectorAll(tagName);
            for (let i = 0; i < elements.length; i++) {
                results.push(elements[i]);
            }
            return results;
        }
        const searchElements = (element) => {
            var _a;
            if (((_a = element.tagName) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === tagName.toLowerCase()) {
                results.push(element);
            }
            const children = element.childNodes || element.children || [];
            for (let i = 0; i < children.length; i++) {
                searchElements(children[i]);
            }
        };
        searchElements(document);
        return results;
    }
    extractImages(document) {
        const images = [];
        const imgElements = this.findAllElements(document, 'img');
        for (let i = 0; i < imgElements.length; i++) {
            const img = imgElements[i];
            images.push({
                src: img.getAttribute ? (img.getAttribute('src') || '') : '',
                alt: img.getAttribute ? (img.getAttribute('alt') || '') : '',
                title: img.getAttribute ? (img.getAttribute('title') || '') : '',
                isInline: this.emailUtils.isInlineImage(img)
            });
        }
        return images;
    }
    extractLinks(document) {
        var _a;
        const links = [];
        const linkElements = this.findAllElements(document, 'a');
        for (let i = 0; i < linkElements.length; i++) {
            const link = linkElements[i];
            const href = link.getAttribute ? (link.getAttribute('href') || '') : '';
            if (href) {
                links.push({
                    href,
                    text: ((_a = link.textContent) === null || _a === void 0 ? void 0 : _a.trim()) || '',
                    title: link.getAttribute ? (link.getAttribute('title') || '') : '',
                    isEmail: href.startsWith('mailto:')
                });
            }
        }
        return links;
    }
    postProcess(markdown) {
        let processed = markdown;
        processed = processed.replace(/\n{3,}/g, '\n\n');
        if (this.options.trimWhitespace) {
            processed = processed.trim();
        }
        processed = this.textUtils.fixMarkdownFormatting(processed);
        return processed;
    }
    initializeEmailContext() {
        return {
            isEmailContent: false,
            hasEmailHeaders: false,
            hasSignature: false,
            hasQuotedContent: false,
            clientType: 'other'
        };
    }
}

class HTMLToMarkdownExtractor {
    constructor(options = {}) {
        this.parser = new HTMLToMDParser(options);
    }
    async convertBatch(htmlArray) {
        const results = [];
        for (let i = 0; i < htmlArray.length; i += HTMLToMarkdownExtractor.MAX_BATCH_SIZE) {
            const batch = htmlArray.slice(i, i + HTMLToMarkdownExtractor.MAX_BATCH_SIZE);
            const batchResults = batch.map(html => {
                try {
                    return this.convert(html);
                }
                catch (error) {
                    return {
                        markdown: '',
                        metadata: { errors: [error.message] }
                    };
                }
            });
            results.push(...batchResults);
            if (global.gc) {
                global.gc();
            }
            await new Promise(resolve => setImmediate(resolve));
        }
        return results;
    }
    convert(html) {
        if (!html || typeof html !== 'string') {
            throw new Error('Invalid HTML input: must be a non-empty string');
        }
        return this.parser.convert(html);
    }
    convertWithOptions(html, options) {
        const tempParser = new HTMLToMDParser(options);
        return tempParser.convert(html);
    }
    dispose() {
        var _a, _b;
        if (this.parser) {
            (_b = (_a = this.parser).cleanup) === null || _b === void 0 ? void 0 : _b.call(_a);
        }
    }
}
HTMLToMarkdownExtractor.MAX_BATCH_SIZE = 100;
function htmlToMarkdown(html, options = {}) {
    const extractor = new HTMLToMarkdownExtractor(options);
    return extractor.convert(html);
}
function emailToMarkdown(emailHtml, options = {}) {
    const cleanedHtml = removeMemoryIntensiveElements(emailHtml);
    const emailOptions = {
        preserveEmailHeaders: true,
        handleEmailSignatures: true,
        convertInlineStyles: true,
        preserveEmailQuotes: true,
        handleOutlookSpecific: true,
        tableHandling: 'convert',
        linkStyle: 'inlined',
        trimWhitespace: true,
        ...options
    };
    const extractor = new HTMLToMarkdownExtractor(emailOptions);
    return extractor.convert(cleanedHtml);
}
function removeMemoryIntensiveElements(html) {
    return html
        .replace(/<img[^>]*src="data:image\/[^"]{1000,}"[^>]*>/gi, '[Large embedded image removed]')
        .replace(/<style[^>]*>[\s\S]{5000,}?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]{1000,}?<\/script>/gi, '')
        .replace(/(\w+)="[^"]{1000,}"/g, '$1="[Long attribute truncated]"');
}

exports.BaseRules = BaseRules;
exports.DOMUtils = DOMUtils;
exports.EmailRules = EmailRules;
exports.EmailUtils = EmailUtils;
exports.HTMLToMDParser = HTMLToMDParser;
exports.HTMLToMarkdownExtractor = HTMLToMarkdownExtractor;
exports.TextUtils = TextUtils;
exports.default = HTMLToMarkdownExtractor;
exports.emailToMarkdown = emailToMarkdown;
exports.htmlToMarkdown = htmlToMarkdown;
//# sourceMappingURL=index.js.map
