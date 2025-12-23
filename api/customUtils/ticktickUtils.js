require('dotenv').config();
const axios = require('axios');
const FormData = require('form-data');
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const { DateTime } = require('luxon'); 

const TOKEN = process.env.TICKTICK_TOKEN || '';
const DEVICE_ID = process.env.TICKTICK_DEVICE_ID;
const BASE_URL = 'https://api.ticktick.com/api/v2';
const GOOGLE_API_KEY = process.env.GOOGLE_KEY;
const USER_TIMEZONE = 'America/New_York';

const HEADERS = {
    'accept': 'application/json, text/plain, */*',
    'content-type': 'application/json;charset=UTF-8',
    'cookie': `t=${TOKEN};`,
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    'x-tz': USER_TIMEZONE,
    'origin': 'https://ticktick.com',
    'referer': 'https://ticktick.com/',
    'X-Device': DEVICE_ID
};


class Task {
    constructor(name, completed, year, month, day, hour, minute, content = '', id = null, projectId = null) {
        this.name = name;
        this.completed = completed;
        
        this.year = year; 
        this.month = month;
        this.day = day;
        this.hour = hour;
        this.minute = minute;
        
        this.content = content; 

        this.id = id;
        this.projectId = projectId;
    }
}

class Project {
    constructor(name, tasks) {
        this.name = name;
        this.tasks = tasks;
    }
}


class TickTickManager {
    constructor() {
        this.projectsCache = [];
    }

    async makeApiRequest(method, endpoint, data = null) {
        const url = `${BASE_URL}${endpoint}`;
        try {
            const config = {
                method: method,
                url: url,
                headers: HEADERS,
                data: data
            };
            const response = await axios(config);
            return response.data;
        } catch (e) {
            console.error(`API Error [${endpoint}]: ${e.message}`);
            return null;
        }
    }

    formatTickTickDate(luxonDt) {
        return luxonDt.toUTC().toFormat("yyyy-MM-dd'T'HH:mm:ss'+0000'");
    }

    parseTaskDate(taskData) {
        const due = taskData.dueDate;
        if (due) {
            const dt = DateTime.fromISO(due).setZone(USER_TIMEZONE);
            return {
                year: dt.year, month: dt.month, day: dt.day,
                hour: dt.hour, minute: dt.minute
            };
        }
        return { year: 0, month: 0, day: 0, hour: 0, minute: 0 };
    }


    async fetchAllTasks() {
        console.log("Fetching fresh tasks from TickTick...");
        const [completedData, activeData, projectsList] = await Promise.all([
            this.makeApiRequest('GET', '/project/all/completedInAll?limit=1000'),
            this.makeApiRequest('GET', '/project/all/tasks?limit=1000'),
            this.makeApiRequest('GET', '/projects?limit=1000')
        ]);

        const projectMap = {};
        if (projectsList && Array.isArray(projectsList)) {
            projectsList.forEach(p => { projectMap[p.id] = p.name; });
        }

        const uniqueTasksMap = new Map();
        const processRawTask = (t) => {
            if (!t || !t.id) return;
            uniqueTasksMap.set(t.id, t); 
        };

        if (completedData && Array.isArray(completedData)) completedData.forEach(processRawTask);
        if (activeData && Array.isArray(activeData)) activeData.forEach(processRawTask);

        const tasksByProject = {}; 

        for (const item of uniqueTasksMap.values()) {
            const pId = item.projectId;
            if (!pId) continue; 

            if (!tasksByProject[pId]) tasksByProject[pId] = [];

            const { year, month, day, hour, minute } = this.parseTaskDate(item);
            const isCompleted = item.status === 2; 
            
            const taskObj = new Task(
                item.title || 'Untitled', 
                isCompleted, 
                year, month, day, hour, minute,
                item.content || '', 
                item.id,
                item.projectId
            );

            tasksByProject[pId].push(taskObj);
        }

        const finalProjects = [];
        for (const [pId, taskList] of Object.entries(tasksByProject)) {
            let pName = projectMap[pId];
            if (!pName) {
                pName = pId.startsWith('inbox') ? 'inbox' : pId;
            }
            finalProjects.push(new Project(pName, taskList));
        }

        this.projectsCache = finalProjects;
        return finalProjects;
    }

    /**
     * Deletes projects via batch API.
     */
    async deleteAllProjects() {
        console.log("Cleaning up projects...");
        const pData = await this.makeApiRequest('GET', '/projects?limit=1000');
        if (!pData) return true;

        const ids = pData.map(p => p.id);

        if (ids.length > 0) {
            await this.makeApiRequest('POST', '/batch/project', { "add": [], "update": [], "delete": ids });
            console.log(`Deleted ${ids.length} projects.`);
        }
        return true;
    }

    /**
     * UPDATED: Deletes tasks first, then runs deleteAllProjects at the end.
     */
    async deleteCachedTasks() {
        if (!this.projectsCache || this.projectsCache.length === 0) {
            console.log("Cache empty. Fetching tasks before deletion...");
            await this.fetchAllTasks();
        }

        const tasksToDelete = [];

        for (const proj of this.projectsCache) {
            for (const t of proj.tasks) {
                if (t.id && t.projectId && t.status != 0) {
                    tasksToDelete.push({
                        taskId: t.id,
                        projectId: t.projectId
                    });
                }
            }
        }

        if (tasksToDelete.length > 0) {
            console.log(`Deleting ${tasksToDelete.length} tasks...`);
            const payload = {
                add: [], update: [],
                delete: tasksToDelete,
                addAttachments: [], updateAttachments: [], deleteAttachments: []
            };
            await this.makeApiRequest('POST', '/batch/task', payload);
        } else {
            console.log("No tasks found to delete.");
        }
        
        await this.deleteAllProjects();

        this.projectsCache = []; 
        return true;
    }

    async parseTaskListWithGemini(taskDescription) {
        const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
        
        const schema = {
            type: SchemaType.OBJECT,
            properties: {
                projects: {
                    type: SchemaType.ARRAY,
                    items: {
                        type: SchemaType.OBJECT,
                        properties: {
                            name: { type: SchemaType.STRING },
                            tasks: {
                                type: SchemaType.ARRAY,
                                items: {
                                    type: SchemaType.OBJECT,
                                    properties: {
                                        name: { type: SchemaType.STRING },
                                        content: { type: SchemaType.STRING },
                                        completed: { type: SchemaType.BOOLEAN },
                                        year: { type: SchemaType.INTEGER },
                                        month: { type: SchemaType.INTEGER },
                                        day: { type: SchemaType.INTEGER },
                                        hour: { type: SchemaType.INTEGER },
                                        minute: { type: SchemaType.INTEGER },
                                    },
                                    required: ["name", "completed", "year", "month", "day", "hour", "minute"]
                                }
                            }
                        },
                        required: ["name", "tasks"]
                    }
                }
            },
            required: ["projects"]
        };

        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash", 
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: schema,
            }
        });

        const estDate = DateTime.now().setZone(USER_TIMEZONE).toFormat("FFFF");

        const prompt = `
        Current Local Time: ${estDate}
        Task: Convert input into a list of Projects containing Tasks.

        Refined Logic:
        - Write a super concise description of the task (single sentence)
        - Ideally, 2-7 words per task name
        - Tasks must be ADHD-friendly: clear, specific, and actionable
        - Focus on one clear objective per task
        - Make as few tasks as possible while maintaining clarity
        - If a task contains multiple actions, break it down

        Extraction Rules:
        1. Extract dates (year/month/day).
        2. Extract times (hour/minute). Times are REQUIRED. If no time is mentioned, infer a logical time or use current time.
        3. Extract additional info into the 'content' field.
        4. Project names should start with an emoji.

        Reasoning step:
        - Take a deep breath and think step-by-step about the plan and context
        
        <input>
        ${taskDescription}
        </input>
        `;

        const result = await model.generateContent(prompt);
        const parsed = JSON.parse(result.response.text());

        const nativeProjects = [];
        if (parsed.projects) {
            for (const p of parsed.projects) {
                const nativeTasks = p.tasks.map(t => 
                    new Task(t.name, t.completed, t.year, t.month, t.day, t.hour, t.minute, t.content || '', null, null)
                );
                nativeProjects.push(new Project(p.name, nativeTasks));
            }
        }
        return nativeProjects;
    }

    async importCsvData(projects) {
        const now = DateTime.now().setZone(USER_TIMEZONE);
        const nowStr = now.toFormat('yyyy-MM-dd');
        const creationTime = now.toUTC().toISO().replace(/\.\d{3}Z$/, ''); 
        
        let csvContent = `"Date: ${nowStr}+0000"\n"Version: 7.1"\n"Status: \n0 Normal\n1 Completed\n2 Archived"\n`;
        
        const columns = ["Folder Name", "List Name", "Title", "Kind", "Tags", "Content", "Is Check list", "Start Date", "Due Date", "Reminder", "Repeat", "Priority", "Status", "Created Time", "Completed Time", "Order", "Timezone", "Is All Day", "Is Floating", "Column Name", "Column Order", "View Mode", "taskId", "parentId"];
        csvContent += columns.map(c => `"${c}"`).join(',') + '\n';

        let tId = 1;

        for (const p of projects) {
            for (const t of p.tasks) {
                let due = "";
                let allDay = "false"; 

                if (t.year > 0) {
                    const dt = DateTime.fromObject({
                        year: t.year, month: t.month, day: t.day,
                        hour: t.hour, minute: t.minute
                    }, { zone: USER_TIMEZONE });

                    due = this.formatTickTickDate(dt);
                }

                const row = [
                    "", t.completed ? "Inbox" : p.name, t.name, "TEXT", "", t.content, "N", "", due, "PT0S", "", "0", t.completed ? "2" : "0", 
                    creationTime, "", String(tId), USER_TIMEZONE, allDay, "false", "", "", "list", String(tId), ""
                ];

                csvContent += row.map(r => `"${(r || '').replace(/"/g, '""')}"`).join(',') + '\n';
                tId++;
            }
        }

        const form = new FormData();
        form.append('file', Buffer.from(csvContent, 'utf-8'), {
            filename: 'file.csv',
            contentType: 'text/csv'
        });

        try {
            const response = await axios.post('https://api.ticktick.com/api/v1/import/restore', form, {
                headers: { ...HEADERS, ...form.getHeaders() }
            });
            return response.status === 200;
        } catch (e) {
            console.error("Import Failed:", e.message);
            return false;
        }
    }

    convertTasksToMarkdown(projects) {
        let mdOutput = "";
        
        for (const proj of projects) {
            mdOutput += `${proj.name}\n`;
            const sortedTasks = [...proj.tasks].sort((a, b) => a.completed - b.completed);

            for (const t of sortedTasks) {
                const check = t.completed ? "[X]" : "[ ]";
                let dateStr = "";

                if (t.year > 0) {
                    const taskDate = DateTime.fromObject({
                        year: t.year, month: t.month, day: t.day,
                        hour: t.hour, minute: t.minute
                    }, { zone: USER_TIMEZONE });

                    const displayDate = taskDate.toFormat('MM/dd/yyyy HH:mm');
                    dateStr = `<${displayDate}> `;
                }

                const desc = t.content ? `\n  > ${t.content}` : "";
                mdOutput += `- ${check} ${dateStr}${t.name}${desc}\n`;
            }
            mdOutput += "\n"; 
        }
        return mdOutput.trim();
    }
}

const tickTickClient = new TickTickManager();


async function getAllTasksMd() {
    try {
        const tasks = await tickTickClient.fetchAllTasks();
        return tickTickClient.convertTasksToMarkdown(tasks);
    } catch (error) {
        console.log(`Error getting tasks: ${error.message}`);
        return `Error getting tasks: ${error.message}`;
    }
}

async function createTasksBulk(tasksDescription) {
    try {
        console.log("Processing bulk task creation...");
        await tickTickClient.deleteCachedTasks();
        
        console.log("Parsing tasks with Gemini...");
        const projects = await tickTickClient.parseTaskListWithGemini(tasksDescription);
        
        console.log(`Importing ${projects.length} projects...`);
        const success = await tickTickClient.importCsvData(projects);
        
        tickTickClient.projectsCache = [];
        return success;
    } catch (error) {
        console.log(`Error creating tasks: ${error.message}`);
        return false;
    }
}

module.exports = {
    Task,
    Project,
    TickTickManager,
    getAllTasksMd,
    createTasksBulk
};