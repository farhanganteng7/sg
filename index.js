'use strict';

const { IgApiClient, IgCheckpointError } = require('instagram-private-api');
const inquirer = require('inquirer'); // Tetap diperlukan untuk input username/password awal
const lodash = require('lodash');
const winston = require('winston');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk'); // --- Perbaikan Utama: Impor Chalk secara langsung ---

// --- Konfigurasi Logger dengan Warna dan Emoji ---
const customLevels = {
    error: 0,
    warn: 1,
    info: 2,
    verbose: 3,
    debug: 4,
    silly: 5
};

const customColors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    verbose: 'cyan',
    debug: 'blue',
    silly: 'magenta'
};

winston.addColors(customColors);

const logger = winston.createLogger({
    levels: customLevels,
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.colorize({ all: true }), // Mengaktifkan pewarnaan untuk semua output
        winston.format.printf(info => {
            let emoji = '';
            switch (info.level.split(':')[0].trim()) { // Mengambil level tanpa warna untuk switch
                case 'ERROR': emoji = '❌'; break;
                case 'WARN': emoji = '⚠️'; break;
                case 'INFO': emoji = '✨'; break;
                case 'VERBOSE': emoji = '📜'; break;
                case 'DEBUG': emoji = '🐛'; break;
                case 'SILLY': emoji = '🤪'; break;
                default: emoji = '';
            }
            return `${emoji} [${info.timestamp}] ${info.level}: ${info.message}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'bot.log', level: 'info', format: winston.format.uncolorize() }), // File log tanpa warna
        new winston.transports.File({ filename: 'error.log', level: 'error', format: winston.format.uncolorize() }), // File error log tanpa warna
    ],
});
// --- Akhir Konfigurasi Logger ---

// Fungsi untuk menghasilkan angka acak dalam rentang
function generateRandomNumber(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Fungsi tidur (delay) dengan Promise
function sleep(timeout) {
    return new Promise(resolve => setTimeout(resolve, timeout));
}

// Instance global IgApiClient
const ig = new IgApiClient();

// Path untuk menyimpan status bot (username dan password)
const STATE_FILE = path.join(__dirname, 'bot_state.json');
// Path untuk menyimpan sesi Instagram (cookies)
const SESSION_FILE = path.join(__dirname, 'session.json');

// --- Fungsi Banner Selamat Datang ---
function printWelcomeBanner(username) {
    const divider = '==================================================';
    const title = '👀✨ Auto View Story Timeline / Beranda Instagram ✨👀';
    const byLine = '🤖 by Farhan Bayu Aditya 🤖';
    const contactIg = '📸 Instagram : @frhandtya_';
    const contactWa = '💬 WhatsApp  : 082125572906';

    // --- Perbaikan Utama: Menggunakan Chalk secara langsung ---
    console.log(chalk.cyan(divider));
    console.log(chalk.green(title));
    console.log(chalk.yellow(byLine));
    console.log(chalk.magenta(contactIg));
    console.log(chalk.blue(contactWa));
    console.log(chalk.cyan(divider));
    // --- Akhir Perbaikan Utama ---

    console.log('');
    logger.info(`Halo, ${username}! Memulai operasi bot...`);
}
// --- Akhir Fungsi Banner ---

// Fungsi untuk memuat status bot (username, password) dan sesi dari file
async function loadState() {
    let botState = {};
    try {
        if (await fs.pathExists(STATE_FILE)) {
            botState = await fs.readJson(STATE_FILE);
            logger.info("Status bot (kredensial) dimuat dari file.");
        }

        if (await fs.pathExists(SESSION_FILE)) {
            const sessionData = await fs.readFile(SESSION_FILE, { encoding: 'utf8' });
            if (sessionData && sessionData.length > 2) {
                ig.state.deserialize(sessionData);
                logger.info("Sesi Instagram dimuat dari file (validasi akan dilakukan saat login).");
            } else {
                logger.warn("File sesi kosong atau rusak saat dimuat. Akan mencoba login baru.");
                await fs.remove(SESSION_FILE).catch(() => {});
            }
        }
    } catch (err) {
        logger.error(`Gagal memuat status bot atau sesi: ${err.message}. Memulai dari awal.`);
        await fs.remove(STATE_FILE).catch(() => {});
        await fs.remove(SESSION_FILE).catch(() => {});
    }
    return botState;
}

// Fungsi untuk menyimpan status bot (username dan password) dan sesi ke file
async function saveState(state) {
    try {
        await fs.writeJson(STATE_FILE, state);
        if (ig.state.cookieUserId) {
            await fs.writeFile(SESSION_FILE, JSON.stringify(await ig.state.serialize()), { encoding: 'utf8' });
            logger.info("Sesi dan status bot (kredensial) berhasil disimpan.");
        } else {
            logger.warn("Sesi tidak lengkap atau tidak valid, tidak dapat menyimpan sesi ke file.");
            await fs.remove(SESSION_FILE).catch(() => {});
        }
    } catch (err) {
        logger.error(`Gagal menyimpan sesi atau status bot: ${err.message}`);
    }
}

// --- Modifikasi Fungsi resolveCheckpoint untuk Otomatisasi Penuh ---
async function resolveCheckpointFullyAutomatic() {
    try {
        logger.warn("Tantangan (checkpoint) terdeteksi! Mencoba menyelesaikan secara otomatis...");
        await ig.challenge.auto(true);
        logger.info("Instagram mencoba mengirim kode verifikasi. Tidak ada input manual yang akan diminta.");
        await sleep(generateRandomNumber(10, 20) * 1000);
        logger.info("Upaya otomatis untuk menyelesaikan checkpoint telah dilakukan. Bot akan mencoba login ulang.");
        return true;
    } catch (err) {
        logger.error("Gagal melakukan upaya otomatis untuk menyelesaikan checkpoint: " + err.message);
        return false;
    }
}
// --- Akhir Modifikasi ---

// Fungsi utama bot
(async () => {
    let botState = await loadState();
    let username = botState.username || null;
    let password = botState.password || null;

    // Jika username/password belum ada di state, minta dari user
    if (!username || !password) {
        const credentials = await inquirer.prompt([
            {
                type: 'input',
                name: 'username',
                message: 'Masukkan Username Instagram Anda:'
            },
            {
                type: 'password',
                name: 'password',
                message: 'Masukkan Password Instagram Anda:'
            }
        ]);
        username = credentials.username;
        password = credentials.password;
        botState.username = username;
        botState.password = password;
        await saveState(botState);
    }

    // --- Panggil Banner Selamat Datang di sini ---
    printWelcomeBanner(username);
    // --- Akhir Panggilan Banner ---

    // Fungsi untuk mencoba login atau melanjutkan sesi
    const attemptLogin = async (retryCount = 0) => {
        const MAX_LOGIN_RETRIES = 3;
        const LOGIN_TIMEOUT_MS = 60 * 1000;
        const CHECKPOINT_COOLDOWN_HOURS = generateRandomNumber(2, 6);

        if (retryCount >= MAX_LOGIN_RETRIES) {
            logger.error(`Gagal login setelah ${MAX_LOGIN_RETRIES} upaya. Bot akan keluar.`);
            return false;
        }

        let isLoggedIn = false;
        ig.state.generateDevice(username);

        try {
            if (ig.state.cookieUserId) {
                 await ig.user.info(ig.state.cookieUserId);
                 logger.info("Sesi yang tersimpan berhasil divalidasi dan digunakan kembali.");
                 isLoggedIn = true;
            } else {
                logger.info("Tidak ada cookie 'ds_user_id' di sesi yang dimuat, akan melakukan login baru.");
                await fs.remove(SESSION_FILE).catch(() => {});
                ig.state.deserialize({});
            }
        } catch (validationErr) {
            logger.warn(`Sesi tersimpan tidak valid atau kadaluarsa: ${validationErr.message}. Akan mencoba login baru.`);
            await fs.remove(SESSION_FILE).catch(() => {});
            ig.state.deserialize({});
            isLoggedIn = false;
        }

        if (!isLoggedIn) {
            try {
                logger.info(`Melakukan login baru (Percobaan ${retryCount + 1}/${MAX_LOGIN_RETRIES})...`);

                const loginPromise = (async () => {
                    await ig.simulate.preLoginFlow();
                    await ig.account.login(username, password);
                    return true;
                })();

                const timeoutPromise = new Promise((resolve, reject) =>
                    setTimeout(() => reject(new Error('Login timeout')), LOGIN_TIMEOUT_MS)
                );

                const loginResult = await Promise.race([loginPromise, timeoutPromise]);

                if (loginResult === true) {
                    logger.info("Login baru berhasil!");
                    await saveState(botState);
                    isLoggedIn = true;
                } else {
                    logger.error("Login gagal karena alasan tidak diketahui setelah timeout.");
                    const delay = generateRandomNumber(10, 30) * 1000;
                    logger.warn(`Terjadi kesalahan saat login (fallback), mencoba lagi dalam ${delay / 1000} detik...`);
                    await sleep(delay);
                    return attemptLogin(retryCount + 1);
                }

            } catch (err) {
                logger.error(`Gagal login: ${err.message}`);
                if (err instanceof IgCheckpointError || (err.response && err.response.body && err.response.body.message === 'challenge_required')) {
                    logger.warn("Tantangan keamanan terdeteksi. Mencoba menyelesaikan secara otomatis...");
                    const checkpointResolved = await resolveCheckpointFullyAutomatic();

                    if (checkpointResolved) {
                        logger.info("Upaya otomatis checkpoint berhasil. Mencoba login ulang.");
                        return attemptLogin(retryCount);
                    } else {
                        const CHECKPOINT_COOLDOWN_HOURS = generateRandomNumber(2, 6);
                        logger.error(`Gagal menyelesaikan checkpoint secara otomatis. Memasuki cooldown ${CHECKPOINT_COOLDOWN_HOURS} jam.`);
                        await sleep(CHECKPOINT_COOLDOWN_HOURS * 60 * 60 * 1000);
                        return attemptLogin(0);
                    }
                } else if (err.message.includes('bad password') || err.message.includes('user not found')) {
                    logger.error("Username atau password salah. Silakan periksa kredensial Anda.");
                    delete botState.username;
                    delete botState.password;
                    await saveState(botState);
                    process.exit(1);
                } else if (err.message === 'Login timeout') {
                    logger.warn("Login terlalu lama (timeout). Mencoba lagi...");
                }
                const delay = generateRandomNumber(10, 30) * 1000;
                logger.warn(`Terjadi kesalahan saat login, mencoba lagi dalam ${delay / 1000} detik...`);
                await sleep(delay);
                return attemptLogin(retryCount + 1);
            }
        }
        return isLoggedIn;
    };

    // Panggil attemptLogin untuk memastikan bot login sebelum memulai loop utama
    let isLoggedIn = await attemptLogin();
    if (!isLoggedIn) {
        logger.error("Bot tidak dapat login setelah upaya berulang. Bot akan keluar.");
        process.exit(1);
    }

    // Fungsi untuk memproses item reels tray
    const executeReelsProcessing = async (nextRequestDelay) => {
        const API_CALL_TIMEOUT_MS = 90 * 1000; // 90 detik timeout untuk panggilan API

        try {
            logger.info("Mencoba mengambil reels tray...");
            const reelsTray = ig.feed.reelsTray();

            const reelsTrayItemsPromise = reelsTray.items();
            const timeoutPromise = new Promise((resolve, reject) =>
                setTimeout(() => reject(new Error('Reels tray API call timeout')), API_CALL_TIMEOUT_MS)
            );
            const reelsTrayItems = await Promise.race([reelsTrayItemsPromise, timeoutPromise]);

            if (reelsTrayItems instanceof Error && reelsTrayItems.message === 'Reels tray API call timeout') {
                 throw reelsTrayItems;
            }

            const unseenReelsTrayItems = reelsTrayItems.filter(item => !item.seen || (item.seen < item.latest_reel_media));

            if (unseenReelsTrayItems.length < 1) {
                logger.info("Tidak ada story baru yang ditemukan untuk dilihat.");
                logger.info(`Permintaan berikutnya dalam ${nextRequestDelay / 60000} menit.`);
                return;
            }

            const userStoriesToSee = unseenReelsTrayItems.map(item => item.user.username);
            logger.info(`Story terbaru dari pengguna yang akan dilihat: ${userStoriesToSee.join(', ')}`);

            for (let userStory of unseenReelsTrayItems) {
                const items = userStory.media_ids.map(media_id => ({
                    id: media_id + "_" + userStory.user.pk,
                    taken_at: userStory.latest_reel_media,
                    user: { pk: userStory.user.pk }
                }));
                const chunkedItems = lodash.chunk(items, 5);

                for (const chunk of chunkedItems) {
                    const storySeenPromise = ig.story.seen(chunk);
                    const storySeenTimeoutPromise = new Promise((resolve, reject) =>
                        setTimeout(() => reject(new Error('Story seen API call timeout')), API_CALL_TIMEOUT_MS)
                    );
                    const storySeenResult = await Promise.race([storySeenPromise, storySeenTimeoutPromise]);

                    if (storySeenResult instanceof Error && storySeenResult.message === 'Story seen API call timeout') {
                        throw storySeenResult;
                    }

                    logger.info(`Story dari ${userStory.user.username} berhasil ditandai sebagai terlihat.`);
                    const miniDelay = generateRandomNumber(1, 3) * 1000;
                    await sleep(miniDelay);
                }

                const delayAfterUser = generateRandomNumber(5, 15) * 1000;
                await sleep(delayAfterUser);
            }

            logger.info(`Permintaan berikutnya dalam ${nextRequestDelay / 60000} menit.`);
        } catch (error) {
            logger.error(`Kesalahan saat memproses reels tray: ${error.message}`);

            let isNetworkError = false;
            if (error.message.includes('ETIMEDOUT') ||
                error.message.includes('ECONNRESET') ||
                error.message.includes('ENOTFOUND') ||
                error.message.includes('network') ||
                (error.name === 'Error' && error.message.includes('socket hang up')) ||
                error.message.includes('API call timeout') ||
                (typeof error.message === 'string' && error.message.includes('request to') && error.message.includes('failed')) ||
                (typeof error.message === 'string' && error.message.includes('Could not connect'))
                ) {
                isNetworkError = true;
            }

            if (error.code && (
                error.code === 'ECONNREFUSED' ||
                error.code === 'EHOSTUNREACH' ||
                error.code === 'ENETUNREACH' ||
                error.code === 'EAI_AGAIN' ||
                error.code === 'ERR_NETWORK_CHANGED' ||
                error.code === 'ECONNABORTED' ||
                error.code === 'ERR_SOCKET_CONNECTION_TIMEOUT' ||
                error.code === 'ERR_SOCKET_CLOSED_WHILE_WAITING'
            )) {
                isNetworkError = true;
            }

            if (error.cause && error.cause.code && (
                error.cause.code === 'ECONNREFUSED' ||
                error.cause.code === 'EHOSTUNREACH' ||
                error.cause.code === 'ENETUNREACH' ||
                error.cause.code === 'EAI_AGAIN' ||
                error.cause.code === 'ERR_NETWORK_CHANGED' ||
                error.cause.code === 'ECONNABORTED'
            )) {
                isNetworkError = true;
            }

            if (isNetworkError) {
                logger.warn("Masalah koneksi terdeteksi. Mencoba rekoneksi dan pengulangan proses...");
                await sleep(generateRandomNumber(10, 30) * 1000);

                let reconnectedAndLoggedIn = false;
                try {
                    reconnectedAndLoggedIn = await attemptLogin();
                } catch (loginError) {
                    logger.error(`Gagal melakukan attemptLogin saat rekoneksi: ${loginError.message}`);
                    reconnectedAndLoggedIn = false;
                }

                if (reconnectedAndLoggedIn) {
                    logger.info("Rekoneksi dan login ulang berhasil. Melanjutkan proses.");
                    await executeReelsProcessing(nextRequestDelay);
                } else {
                    logger.error("Gagal rekoneksi dan login ulang setelah masalah jaringan. Bot mungkin akan offline untuk sementara.");
                }
            } else if (error.message.includes('challenge_required') || (error.response && error.response.body && error.response.body.message === 'challenge_required')) {
                logger.warn("Tantangan keamanan terdeteksi saat memproses story. Mencoba menyelesaikan secara otomatis dan melanjutkan.");
                const checkpointResolved = await resolveCheckpointFullyAutomatic();
                if (checkpointResolved) {
                    await sleep(generateRandomNumber(10, 20) * 1000);
                    await executeReelsProcessing(nextRequestDelay);
                } else {
                    const CHECKPOINT_COOLDOWN_HOURS = generateRandomNumber(2, 6);
                    logger.error(`Gagal menyelesaikan checkpoint secara otomatis saat memproses story. Memasuki cooldown ${CHECKPOINT_COOLDOWN_HOURS} jam.`);
                    await sleep(CHECKPOINT_COOLDOWN_HOURS * 60 * 60 * 1000);
                }
            } else if (error.message.includes('Rate limit exceeded') || (error.response && error.response.body && error.response.body.message && error.response.body.message.includes('Rate limit exceeded'))) {
                logger.warn("Batas laju (rate limit) Instagram tercapai. Menjeda untuk durasi yang lebih lama.");
                await sleep(generateRandomNumber(30 * 60, 60 * 60) * 1000);
                await executeReelsProcessing(nextRequestDelay);
            } else {
                logger.error(`Kesalahan tak terduga: ${error.message}`);
                logger.warn("Mencoba login ulang untuk mengatasi error tak terduga.");
                let reconnectedAndLoggedIn = await attemptLogin();
                if (reconnectedAndLoggedIn) {
                    await sleep(generateRandomNumber(5, 10) * 1000);
                    await executeReelsProcessing(nextRequestDelay);
                } else {
                    logger.error("Gagal login ulang setelah error tak terduga. Bot mungkin akan offline.");
                }
            }
        }
    };

    // Loop rekursif untuk meminta reels tray setiap beberapa menit
    const mainLoop = () => {
        const delay = generateRandomNumber(5, 15) * 60000;
        logger.info("Memulai siklus utama bot...");
        executeReelsProcessing(delay).catch(err => {
            logger.error(`Unhandled error in executeReelsProcessing in mainLoop: ${err.message}`);
        });
        setTimeout(mainLoop, delay);
    };

    mainLoop(); // Mulai loop utama bot

})();

// Anda perlu menginstal dependencies ini:
// npm install instagram-private-api inquirer lodash winston fs-extra chalk
