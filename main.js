const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const os = require("os");
const path = require("path");
const fs = require("fs");
const xlsx = require("xlsx");
const { chromium } = require("playwright");
const { log } = require("console");
let db;
const { Pool } = require("pg");
let mainWindow;
let browser; // Chromium instance
let sessions = {}; // lưu {accountName: context}
const axios = require('axios');
const stream = require('stream');
const { promisify } = require('util');
const pipeline = promisify(stream.pipeline);
const { v4: uuidv4 } = require('uuid');

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 750,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile("index.html");
}

let pool;

async function connectDB() {
    pool = new Pool({
        connectionString: "postgresql://veo3_api_user:WuIvkqeoiGlH2HPwxCfqju7iabdKnWD2@dpg-d340b5nfte5s73ebqi6g-a.oregon-postgres.render.com/veo3_api",
        ssl: { rejectUnauthorized: false }
    });
}

// app.whenReady().then(createWindow);
app.whenReady()
    .then(() => connectDB())
    .then(() => createWindow())
    .catch(err => {
        console.error("Lỗi khi khởi chạy app:", err);
    });

let currentUser = null;
ipcMain.handle("login", async (event, { username, password }) => {
    try {
        const result = await pool.query(
            "SELECT id, user_veo, pass_veo, role_veo, status FROM \"veo3-admin\".users WHERE user_veo=$1 and  pass_veo=$2",
            [username, password]
        );

        if (result.rows.length === 0) {
            return { success: false, message: "Sai tài khoản hoặc mật khẩu" };
        }

        if (result.rows[0].status == false) {
            return { success: false, message: "Tài khoản đã khóa!" };
        }

        const user = {
            id: result.rows[0].id,
            username: result.rows[0].user_veo,
            role: result.rows[0].role_veo,
            status: result.rows[0].status
        };

        currentUser = user;

        return { success: true, user: currentUser };
    } catch (err) {
        console.error("Lỗi login:", err);
        return { success: false, message: "Lỗi Đăng nhập" };
    }
});

ipcMain.handle("getCurrentUser", () => currentUser);


function createLoginWindow() {
    loginWindow = new BrowserWindow({
        width: 400,
        height: 300,
        resizable: false,
        modal: true,
        frame: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    loginWindow.loadFile("login.html");
}


// ----------------- Excel Import -----------------
ipcMain.handle("open-excel-dialog", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ["openFile"],
        filters: [{ name: "Excel", extensions: ["xlsx", "xls"] }]
    });
    if (canceled) return null;

    const wb = xlsx.readFile(filePaths[0]);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const jsonData = xlsx.utils.sheet_to_json(ws, { header: ["prompt"], defval: "" });
    return jsonData.map((row) => ({ prompt: row.prompt }));
});

ipcMain.handle("open-excel-dialog-img", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ["openFile"],
        filters: [{ name: "Excel", extensions: ["xlsx", "xls"] }]
    });
    if (canceled) return null;

    const wb = xlsx.readFile(filePaths[0]);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const jsonData = xlsx.utils.sheet_to_json(ws, { header: ["prompt"], defval: "" });
    return jsonData.map((row) => ({ prompt: row.prompt }));
});



// Login lưu session vào file
ipcMain.handle("login-account", async (event, { accountName }) => {
    let context;
    let browserInstance;

    try {
        // Đặt file session cho từng account
        const accountFile = path.join(app.getPath("userData"), `${accountName}.json`);

        // const chromiumPath = path.join(process.resourcesPath, "browsers", "chrome.exe");
        const chromiumPath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

        const browserInstance = await chromium.launch({
            headless: false,
            executablePath: chromiumPath,
            args: [
                "--disable-blink-features=AutomationControlled"
            ]
        });

        // const browserInstance = await chromium.launch({
        //     headless: false
        // });

        const context = await browserInstance.newContext();
        const page = await context.newPage();
        await page.goto("https://labs.google/fx/tools/flow", { waitUntil: "domcontentloaded" });

        await dialog.showMessageBox({
            type: "info",
            buttons: ["OK"],
            title: "Login required",
            message: `Vui lòng login account ${accountName}. Nhấn OK khi login xong.`
        });

        // Lấy storageState sau khi login
        const storage = await context.storageState();

        // Lưu storageState vào file riêng cho account này
        fs.writeFileSync(accountFile, JSON.stringify(storage, null, 2), "utf-8");

        sessions[accountName] = context;

        // Đóng browser sau khi lưu
        await page.close();
        // await context.close();
        await browserInstance.close();

        return { success: true, message: `Login xong, đã lưu session cho ${accountName}`, file: accountFile };

    } catch (err) {
        console.error(`Login failed for ${accountName}:`, err);
        if (context) await context.close();
        if (browserInstance) await browserInstance.close();
        return { success: false, error: err.message };
    }
});


const downloadsDir = path.join(os.homedir(), "Videos", "veo3-downloads");
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir);

// Hàm generate video
async function generateVideoFlow(prompt, accountName) {

    const checkFileSession = path.join(app.getPath("userData"), `${accountName}.json`);
    if (!fs.existsSync(checkFileSession)) {
        throw new Error(`Chưa login cho account ${accountName}`);
    }

    const chromiumPath = path.join(process.resourcesPath, "browsers", "chrome.exe");

    // Launch browser mới mỗi lần
    const browser = await chromium.launch({
        headless: true,
        executablePath: chromiumPath
    });

    // const browser = await chromium.launch({
    //     headless: false
    // });

    // Tạo context mới từ storageState (file login)
    const context = await browser.newContext({ storageState: checkFileSession });

    // Tạo page mới
    const page = await context.newPage();
    await page.goto("https://labs.google/fx/tools/flow", { waitUntil: 'domcontentloaded' });


    await page.getByRole('button', { name: 'add_2 New project' }).click();

    // lấy số video
    const count = getNumberVideos();
    // Điền prompt
    await page.getByRole('textbox', { name: 'Generate a video with text…' }).click();
    await page.getByRole('textbox', { name: 'Generate a video with text…' }).fill(prompt);
    await page.getByRole('button', { name: 'volume_up Veo 3 - Fast' }).click();
    await page.getByText('Outputs per prompt2arrow_drop_down').click();
    await page.getByRole('option', { name: count.toString() }).click();


    // Bấm Create
    await page.getByRole('button', { name: 'arrow_forward Create' }).click();


    // --- Chờ nút Download xuất hiện ---
    const downloadButtons = page.getByRole('button', { name: 'download Download' });
    await downloadButtons.first().waitFor({ state: 'visible', timeout: 180000 });

    // --- Tải từng video ---
    try {
        for (let i = 0; i < count; i++) {
            try {
                await page.waitForTimeout(10000);
                const child = page.locator('.bZBZFo').nth(i).locator('.eJgIbK').first();
                await child.hover();
                const target = child.locator('.hFhuTI').first();
                await target.click();
                await page.getByRole('menuitem', { name: 'aspect_ratio Upscaled (1080p)' }).click();
            } catch (err) {
                continue;
            }
        }


        const downLi = page.getByLabel('Notifications alt+T').getByText('Download');
        await downLi.first().waitFor({ state: 'visible', timeout: 180000 });


        let countVideo = 0;
        while (countVideo < count) {
            try {
                const downloadBtn = page.getByLabel('Notifications alt+T').getByText('Download').first();
                await downloadBtn.waitFor({ state: 'visible', timeout: 60000 });
                const download1Promise = page.waitForEvent('download', { timeout: 120000 });
                if (!(await downloadBtn.isVisible())) break;

                // chờ sự kiện download
                await downloadBtn.click();
                const download = await download1Promise;

                // lưu file
                const now = new Date();
                const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
                const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, "");
                const fileName = `${accountName}_${dateStr}_${timeStr}.mp4`;
                const filePath = path.join(downloadsDir, fileName);
                await download.saveAs(filePath);

                // bấm Dismiss ngay sau khi download
                await page.getByLabel('Notifications alt+T').getByText('Dismiss').first().click();
                countVideo++;
            } catch (err) {
                continue;
            }
        }


    } finally {
        await page.close();
        await browser.close();
    }


}



// const downloadsDir = path.join(os.homedir(), "Videos", "veo3-downloads");
// if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir);

// // Hàm generate video
// async function generateVideoFlow(prompt, accountName) {

//     const checkFileSession = path.join(app.getPath("userData"), `${accountName}.json`);
//     if (!fs.existsSync(checkFileSession)) {
//         throw new Error(`Chưa login cho account ${accountName}`);
//     }

//     const numberVideos = getNumberVideos();
//     const cookies = storageState.cookies;
//     const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

//     // tạo project
//     const bodyCreateProject = {
//         json: {
//             projectTitle: uuidv4(),
//             toolName: 'PINHOLE'
//         }
//     };

//     const resCreateProject = await axios.get('https://labs.google/fx/api/trpc/project.createProject', bodyCreateProject, {
//         headers: {
//             'Cookie': cookieHeader,
//             'User-Agent': 'Mozilla/5.0',
//             'Accept': 'application/json'
//         }
//     });

//     if (resCreateProject.status !== 200) {
//         throw new Error(`Lỗi tạo project trên Flow ${resCreateProject.status}`);
//     }

//     const bodyRes = resCreateProject.data;

//     const projectId = bodyRes.result?.data?.json?.result?.projectId;

//     // lấy access token
//     let accessToken = "";
//     try {
//         const res = await axios.get('https://labs.google/fx/api/auth/session', {
//             headers: {
//                 'Cookie': cookieHeader,
//                 'User-Agent': 'Mozilla/5.0',
//                 'Accept': 'application/json'
//             }
//         });

//         // Check status code
//         if (res.status !== 200) {
//             throw new Error(`API trả về status ${res.status}`);
//         }

//         const body = res.data;

//         // Lấy access token
//         accessToken = body.access_token;

//         if (!accessToken) {
//             throw new Error('Access token rỗng hoặc chưa có trong body');
//         }
//     } catch (err) {
//         throw err;
//     }


//     // generate video

//     let requests = [];
//     let listName = [];
//     for (let i = 0; i < numberVideos; i++) {
//         const sceneId = uuidv4();
//         listName.push(sceneId);
//         requests.push({
//             aspectRatio: "VIDEO_ASPECT_RATIO_LANDSCAPE",
//             seed: Math.floor(Math.random() * 1e5), // seed random
//             textInput: { prompt },
//             videoModelKey: "veo_3_0_t2v_fast_ultra",
//             metadata: {
//                 sceneId: sceneId
//             }
//         });
//     }

//     console.log(listName);


//     const bodyGenVideo = {
//         clientContext: {
//             projectId: projectId,
//             tool: "PINHOLE",
//             userPaygateTier: "PAYGATE_TIER_TWO"
//         },
//         requests
//     };

//     const resGenVideo = await axios.get('https://aisandbox-pa.googleapis.com/v1/video:batchAsyncGenerateVideoText', bodyGenVideo, {
//         headers: {
//             'Authorization': `Bearer ${accessToken}`,
//             'Content-Type': 'application/json'
//         },
//         timeout: 60000
//     });
//     if (resGenVideo.status !== 200) {
//         throw new Error(`Lỗi tạo video ${resGenVideo.status}`);
//     }

//     await sleep(60 * 1000);

//     // gọi hàm  CheckAsyncVideoGenerationStatus
//     // build request
//     const bodyCheckGenVideo = {
//         clientContext: {
//             projectId: projectId,
//             tool: "PINHOLE",
//             userPaygateTier: "PAYGATE_TIER_TWO"
//         },
//         requests
//     }
//     let attempt = 0;
//         const maxRetries = 3;
//         while (attempt < maxRetries) {
//             const resCheckGenVideo = await axios.get('https://aisandbox-pa.googleapis.com/v1/video:batchCheckAsyncVideoGenerationStatus', bodyCheckGenVideo, {
//         headers: {
//             'Authorization': `Bearer ${accessToken}`,
//             'Content-Type': 'application/json'
//         },
//         timeout: 60000
//     });
//         }

// }




// const downloadsImgDir = path.join(os.homedir(), "Pictures", "Image-FX");
// if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir);
// async function generateImageFlow(promptList, accountName) {
//     console.log("accountName " + accountName);


//     const checkFileSession = path.join(app.getPath("userData"), `${accountName}.json`);
//     if (!fs.existsSync(checkFileSession)) {
//         throw new Error(`Chưa login cho account ${accountName}`);
//     }

//     const storageState = JSON.parse(fs.readFileSync(checkFileSession, 'utf-8'));

//     const chromiumPath = path.join(process.resourcesPath, "browsers", "chrome.exe");

//     // tạo browser (không cần launchPersistentContext, chỉ cần launch)
//     // const filePath = path.join(__dirname, "proxy.txt");
//     const filePath = path.join(process.resourcesPath, "browsers", "proxy.txt");
//     const lines = fs.readFileSync(filePath, "utf8").trim().split("\n");

//     const proxies = lines.map(line => {
//         // tách theo dấu :
//         const [ip, port, user, pass] = line.trim().split(":");
//         return {
//             host: `${ip}:${port}`,
//             user,
//             pass
//         };
//     });


//     let attempt = 0;
//     let page, browser, context;
//     while (attempt < 5) {
//         attempt++;

//         const randomIndex = Math.floor(Math.random() * proxies.length);
//         const { host, user, pass } = proxies[randomIndex];


//         browser = await chromium.launch({
//             headless: false,
//             executablePath: chromiumPath,
//             proxy: {
//                 server: `http://${host}`,
//                 username: user,
//                 password: pass
//             }
//         });

//         context = await browser.newContext({ storageState });
//         page = await context.newPage();

//         try {
//             await page.goto("https://labs.google/fx/tools/image-fx", {
//                 waitUntil: "domcontentloaded",
//                 timeout: 120000,
//             });

//             const currentUrl = page.url();
//             console.log("currentUrl:", currentUrl);

//             if (!currentUrl.startsWith("https://labs.google/fx/tools/image-fx/unsupported-country")) {
//                 break;
//             }

//             await browser.close();
//             continue;

//         } catch (err) {
//             if (browser) await browser.close();
//             continue;
//         }


//     }

//     if (!page) {
//         throw new Error("Không tìm được proxy hợp lệ");
//     }

//     await page.waitForTimeout(5000);

//     // lap tung item
//     for (let i = 0; i < promptList.length; i++) {
//         const prompt = promptList[i].prompt;
//         if (i !== 0) {
//             await page.goto('https://labs.google/fx/tools/image-fx', {
//                 waitUntil: 'domcontentloaded',
//                 timeout: 120000
//             });
//         }
//         try {
//             const btn = page.locator('button[style="opacity: 1;"]');
//             await btn.waitFor({ state: 'visible', timeout: 60000 }); // chờ tối đa 60s
//             await btn.click();
//             await page.getByRole('textbox').click();
//             await page.getByRole('textbox').fill(prompt);
//             await page.getByRole('button', { name: 'spark Create' }).click();

//             await page.getByRole('button', { name: 'spark Create' }).waitFor({ state: 'visible', timeout: 180000 });

//             try {
//                 if (i === 0) {
//                     await page.getByRole('button', { name: 'close Open the Changelog' }).click();
//                 }
//             } catch (err) {
//                 console.log("k tim thay close Open the Changelog");
//             }

//             await page.waitForTimeout(15000);



//             try {
//                 const downloadIndexes = [1, 2, 3, 4];
//                 for (let j = 0; j < downloadIndexes.length; j++) {
//                     try {
//                         const parentDiv = page.locator(`.osSup:nth-child(${downloadIndexes[j]})`).first();

//                         // Hover vào phần tử con .EhKOZ để hiện nút Download
//                         const targetDiv = parentDiv.locator('.EhKOZ').first();
//                         await targetDiv.hover();
//                         await page.waitForTimeout(500); // chờ animation/overlay biến mất

//                         // Chọn nút Download trong parent
//                         const downloadButton = parentDiv.locator('button:has(span:text("Download"))').first();

//                         // Bắt download native trước click
//                         const downloadPromise = page.waitForEvent('download', { timeout: 120000 });

//                         // Click trực tiếp bằng Playwright
//                         await downloadButton.click({ timeout: 60000 });

//                         // Lấy file download và lưu
//                         const download = await downloadPromise;

//                         const now = new Date();
//                         const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ""); // yyyyMMdd
//                         const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, ""); // HHmmss
//                         const fileName = `${accountName}_${dateStr}_${timeStr}_${j + 1}.jpg`;

//                         const filePath = path.join(downloadsImgDir, fileName);
//                         await download.saveAs(filePath);
//                     } catch (err) {
//                         continue;
//                     }

//                 }
//             } finally {
//             }
//         } catch (err) {
//             continue;
//         } finally {
//         }

//     }

//     await page.close();
//     await browser.close();
// }


const downloadsImgDir = path.join(os.homedir(), "Pictures", "Image-FX");
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir);
async function generateImageFlow(prompt, accountName) {
    const checkFileSession = path.join(app.getPath("userData"), `${accountName}.json`);
    if (!fs.existsSync(checkFileSession)) {
        throw new Error(`Chưa login cho account ${accountName}`);
    }

    const configURLPath = path.join(process.resourcesPath, "browsers", "fileUrl.json");
    // const configURLPath = path.join(__dirname, "fileUrl.json");

    let config = {};
    try {
        const content = fs.readFileSync(configURLPath, 'utf-8');
        config = JSON.parse(content);

    } catch (err) {
        throw new Error(`Lỗi đọc file ` + configURLPath + ` === err: ` + err);
    }

    const storageState = JSON.parse(fs.readFileSync(checkFileSession, 'utf-8'));
    const cookies = storageState.cookies;
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    let accessToken = "";
    try {
        const res = await axios.get(config.urlGetSession, {
            headers: {
                'Cookie': cookieHeader,
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/json'
            }
        });

        // Check status code
        if (res.status !== 200) {
            throw new Error(`API trả về status ${res.status}`);
        }

        const body = res.data;

        // Lấy access token
        accessToken = body.access_token;

        if (!accessToken) {
            throw new Error('Login lại tài khoản Google để lấy Access Token');
        }
    } catch (err) {
        throw err;
    }


    const urlImageFX = config.urlImageFX;


    // cho rety 3 lần
    let attempt = 0;
    const maxRetries = 3;
    while (attempt < maxRetries) {
        try {
            const body = {
                userInput: {
                    candidatesCount: 4,
                    prompts: [prompt.replace(/"/g, "'")],
                    seed: Math.floor(Math.random() * 1e6)
                },
                clientContext: {
                    sessionId: Date.now().toString(),
                    tool: "IMAGE_FX"
                },
                modelInput: {
                    modelNameType: "IMAGEN_3_1"
                },
                aspectRatio: "IMAGE_ASPECT_RATIO_LANDSCAPE"
            };

            const resImg = await axios.post(urlImageFX, body, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 60000
            });

            if (resImg.status === 200) {
                await saveGeneratedImages(resImg);
                break;
            } else {
                attempt++;
            }
        } catch (err) {
            log(err);
            attempt++;
            if (attempt === maxRetries) {
                throw new Error(err);
            }
        }
    }


}

async function saveGeneratedImages(resImg) {
    const body = resImg.data;
    if (!body.imagePanels || !Array.isArray(body.imagePanels)) {
        throw new Error('Access token rỗng hoặc chưa có trong body');
    }
    const fileUUID = uuidv4();
    for (let panelIndex = 0; panelIndex < body.imagePanels.length; panelIndex++) {
        const panel = body.imagePanels[panelIndex];

        if (!panel.generatedImages || !Array.isArray(panel.generatedImages)) continue;

        for (let imgIndex = 0; imgIndex < panel.generatedImages.length; imgIndex++) {
            const img = panel.generatedImages[imgIndex];
            const base64Data = img.encodedImage;

            if (!base64Data) {
                continue;
            }

            try {
                // tạo buffer từ base64
                const buffer = Buffer.from(base64Data, 'base64');
                const readStream = stream.Readable.from(buffer);

                const fileName = `${fileUUID}_${imgIndex + 1}.jpg`
                const filePath = path.join(downloadsImgDir, fileName);
                const writeStream = fs.createWriteStream(filePath);
                await pipeline(readStream, writeStream);
            } catch (err) {
                continue;
            }
        }
    }
}



// Load session từ file nếu chưa có trong sessions
async function loadSession(accountName) {
    const file = path.join(app.getPath("userData"), `${accountName}.json`);
    if (!fs.existsSync(file)) return null;
    // if (!browser) browser = await chromium.launch({ headless: true });
    const chromiumPath = path.join(process.resourcesPath, "browsers", "chrome.exe");

    console.log("Chromium path:", chromiumPath);

    // Launch Chromium
    const browserInstance = await chromium.launch({
        headless: true,
        executablePath: chromiumPath
    });
    const context = await browserInstance.newContext({ storageState: file });
    sessions[accountName] = context;
    return context;
}



// ----------------- Queue -----------------
function distributeQueue(queue, accounts) {
    const distributed = accounts.map(() => []);
    queue.forEach((item, idx) => {
        const accIndex = idx % accounts.length;
        distributed[accIndex].push(item);
    });
    return distributed;
}


async function runQueue(queue, account) {
    const results = [];
    for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        try {
            // Bước bắt đầu tải
            mainWindow.webContents.send("progress", {
                account,
                index: i + 1,
                total: queue.length,
                step: "downloading",
                prompt: item.prompt
            });

            // Fast gen
            const fastFile = await generateVideoFlow(item.prompt, account);
            mainWindow.webContents.send("progress", {
                account,
                index: i + 1,
                total: queue.length,
                step: "fast",
                file: fastFile,
                prompt: item.prompt
            });
        } catch (err) {
            mainWindow.webContents.send("progress", {
                account,
                index: i + 1,
                total: queue.length,
                step: "error",
                error: err.message,
                prompt: item.prompt
            });
            results.push({
                account,
                prompt: item.prompt,
                error: err.message,
                status: "error"
            });
        }
    }

    // Khi xong hết
    mainWindow.webContents.send("done", { account, results });
    return results;
}

async function runQueueImage(queue, account) {
    const results = [];
    for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        try {
            // Bước bắt đầu tải
            mainWindow.webContents.send("progressImg", {
                account,
                index: i + 1,
                total: queue.length,
                step: "downloading",
                prompt: item.prompt
            });

            // Fast gen
            const fastFile = await generateImageFlow(item.prompt, account);
            mainWindow.webContents.send("progressImg", {
                account,
                index: i + 1,
                total: queue.length,
                step: "fast",
                file: fastFile,
                prompt: item.prompt
            });
        } catch (err) {
            mainWindow.webContents.send("progressImg", {
                account,
                index: i + 1,
                total: queue.length,
                step: "error",
                error: err.message,
                prompt: item.prompt
            });
            results.push({
                account,
                prompt: item.prompt,
                error: err.message,
                status: "error"
            });
        }
    }

    // Khi xong hết
    mainWindow.webContents.send("doneImg", { account, results });
    return results;
}

// async function runQueueImage(queue, account) {
//     const results = [];
//     const item = queue;
//     try {
//         // Bước bắt đầu tải
//         mainWindow.webContents.send("progressImg", {
//             account,
//             index: 2,
//             total: queue.length,
//             step: "downloading",
//             prompt: item
//         });

//         // Fast gen
//         const fastFile = await generateImageFlow(item, account);
//         mainWindow.webContents.send("progressImg", {
//             account,
//             index: 2,
//             total: queue.length,
//             step: "fast",
//             file: fastFile,
//             prompt: item
//         });
//     } catch (err) {
//         mainWindow.webContents.send("progressImg", {
//             account,
//             index: 2,
//             total: queue.length,
//             step: "error",
//             error: err.message,
//             prompt: item
//         });
//         results.push({
//             account,
//             prompt: item,
//             error: err.message,
//             status: "error"
//         });
//     }

//     // Khi xong hết
//     mainWindow.webContents.send("doneImg", { account, results });
//     return results;
// }




ipcMain.handle("generate-videos", async (event, { accounts, queue }) => {
    const accountsGen = getAccountsFromConfigPath();
    console.log("accounts get from Config:", accountsGen);

    if (!accountsGen.length || !queue.length) return;
    mainWindow.webContents.send("clearProgress");

    const distributedQueues = distributeQueue(queue, accountsGen);

    await Promise.all(
        accountsGen.map(async (acc, idx) => {
            const results = await runQueue(distributedQueues[idx], acc);

            mainWindow.webContents.send("done", {
                account: acc,
                results
            });

            return results;
        })
    );
});


// generate image veo 3
ipcMain.handle("generate-images", async (event, { accounts, queue }) => {
    const accountsGen = getAccountsFromConfigPath();

    if (!accountsGen.length || !queue.length) return;
    mainWindow.webContents.send("clearProgress");

    const distributedQueues = distributeQueue(queue, accountsGen);

    await Promise.all(
        accountsGen.map(async (acc, idx) => {
            const results = await runQueueImage(distributedQueues[idx], acc);

            mainWindow.webContents.send("done", {
                account: acc,
                results
            });

            return results;
        })
    );
});



const configFilePath = path.join(app.getPath("userData"), "veo3Config.json");
// Handler save config
ipcMain.handle("save-config", async (event, cfg) => {
    try {
        fs.writeFileSync(configFilePath, JSON.stringify(cfg, null, 2), "utf-8");
        return { success: true, path: configFilePath };
    } catch (err) {
        console.error("Lỗi khi lưu config:", err);
        return { success: false, error: err.message };
    }
});

// Handler load config
ipcMain.handle("load-config", async () => {
    try {
        if (fs.existsSync(configFilePath)) {
            return JSON.parse(fs.readFileSync(configFilePath, "utf-8"));
        }
        return {};
    } catch (err) {
        console.error("Lỗi khi đọc config:", err);
        return {};
    }
});

function getNumberVideos() {
    try {
        if (fs.existsSync(configFilePath)) {
            const cfg = JSON.parse(fs.readFileSync(configFilePath, "utf-8"));
            return parseInt(cfg.numberVideos) || 2;
        }
        return 2;
    } catch (err) {
        return 2;
    }
}

function getAccountsFromConfigPath() {
    try {
        if (fs.existsSync(configFilePath)) {
            const cfg = JSON.parse(fs.readFileSync(configFilePath, "utf-8"));
            if (Array.isArray(cfg.accounts)) {
                return cfg.accounts;
            }
        }
        return [];
    } catch (err) {
        console.error("Lỗi khi đọc accounts:", err);
        return [];
    }
}


ipcMain.handle("getUsers", async () => {
    if (!currentUser || currentUser.role !== "admin") return [];

    try {
        const result = await pool.query(
            'SELECT id, user_veo AS username, role_veo as role, status FROM "veo3-admin".users WHERE role_veo <> $1',
            ['admin']
        );
        return result.rows;
    } catch (err) {
        console.error("Lỗi getUsers:", err);
        return [];
    }
});

ipcMain.handle("addUser", async (event, { username, password, role }) => {
    if (!currentUser || currentUser.role !== "admin") return { success: false, message: "Forbidden" };
    const result = await pool.query(
        'INSERT INTO "veo3-admin".users(user_veo, pass_veo, role_veo, status) VALUES($1,$2,$3,true) RETURNING id, user_veo AS username, role_veo AS role',
        [username, password, role]
    );
    return { success: true, user: result.rows[0] };
});

ipcMain.handle("editUser", async (event, { id, username, password, role }) => {
    if (!currentUser || currentUser.role !== "admin") return { success: false, message: "Forbidden" };
    await pool.query(
        'UPDATE "veo3-admin".users SET user_veo=$1, pass_veo=$2, role_veo=$3 WHERE id=$4',
        [username, password, role, id]
    );
    return { success: true };
});

ipcMain.handle("deleteUser", async (event, { id }) => {
    if (!currentUser || currentUser.role !== "admin") return { success: false, message: "Forbidden" };
    await pool.query('DELETE FROM "veo3-admin".users WHERE id=$1', [id]);
    return { success: true };
});

