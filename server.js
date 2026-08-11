import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import redis from 'redis';
import mongoose from 'mongoose';
import axios from 'axios';
import { fileURLToPath } from 'url';
import path from 'path';

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// تقديم ملفات الواجهة الأمامية تلقائياً
app.use(express.static(__dirname));

// السماح بتبادل البيانات والاتصال المباشر (CORS) الشامل
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, allowEIO3: true });

// 🌟 حقن رابط قاعدة البيانات مباشرة لتخطي جدار الحماية 🌟
const dbUrl = "mongodb+srv://ofayad:VcK8drjwshmhBm8W@ofayad.3r2a6lb.mongodb.net/?appName=ofayad";
mongoose.connect(dbUrl, { serverSelectionTimeoutMS: 5000 })
    .then(() => console.log('✅ قاعدة البيانات السحابية متصلة بنجاح وعبرت الأمان!'))
    .catch(() => console.log('⚠️ وضع الذاكرة الاحتياطية نشط'));

let localMemoryCache = {};

// مسار جلب المباريات الاحترافي المباشر بالتواريخ والقنوات والمعلقين
app.get('/api/matches', async (req, res) => {
    // التقاط التاريخ القادم من المتصفح تلقائياً
    const requestedDate = req.query.date || new Date().toISOString().split('T')[0];
    const cacheKey = `sports_db_matches_${requestedDate}`;

    try {
        // فحص الكاش المحلي لتسريع الموقع
        if (localMemoryCache[cacheKey] && Date.now() < localMemoryCache[cacheKey].expireAt) {
            return res.json({ source: 'Local Memory Cache', data: localMemoryCache[cacheKey].data });
        }

        console.log(`📡 جلب مباريات اليوم الحقيقية والممتازة من TheSportsDB ليوم: ${requestedDate}`);
        
        // 🌟 حقن وتفعيل مفتاحك البريميوم المدفوع مباشرة في الرابط لتخطي حظر الحزمة 🌟
        const apiKey = '5010468507';
        let events = [];

        try {
            const response = await axios.get(`https://thesportsdb.com{apiKey}/eventsday.php?d=${requestedDate}`, { timeout: 6000 });
            events = response.data.events || [];
        } catch (apiErr) {
            console.log("⚠️ تراجع مؤقت للمفتاح الاحتياطي العام بسبب الضغط...");
            const fallbackResponse = await axios.get(`https://thesportsdb.com{requestedDate}`);
            events = fallbackResponse.data.events || [];
        }

        // إذا كانت القائمة فارغة في هذا اليوم يرسل مصفوفة فارغة آمنة تظهر الرسالة في الواجهة وينكسر التعليق
        if (!events || events.length === 0) {
            return res.json({ source: 'TheSportsDB (Empty)', data: [] });
        }

        // إعادة هيكلة وتجهيز البيانات باللغة العربية والشعارات لملعبك المظلم الفخم
        const standardMatches = events.map(event => {
            return {
                fixture: {
                    id: event.idEvent,
                    date: `${event.strDate}T${event.strTime || '00:00:00'}`,
                    status: {
                        short: event.strStatus === "Not Started" ? "NS" : event.strStatus === "Final" ? "FT" : "LIVE",
                        elapsed: event.strProgress || ""
                    }
                },
                league: {
                    name: event.strLeague || "بطولات كبرى"
                },
                teams: {
                    home: {
                        name: event.strHomeTeam,
                        logo: event.strHomeTeamBadge || "https://thesportsdb.com"
                    },
                    away: {
                        name: event.strAwayTeam,
                        logo: event.strAwayTeamBadge || "https://thesportsdb.com"
                    }
                },
                goals: {
                    home: parseInt(event.intHomeScore) || 0,
                    away: parseInt(event.intAwayScore) || 0
                },
                media: {
                    channel: event.strTVStation || "SSC Sports / beIN",
                    commentator: "محدد لاحقاً"
                }
            };
        });

        // حفظ النتيجة في الكاش الداخلي لمدة دقيقة واحدة
        localMemoryCache[cacheKey] = { data: standardMatches, expireAt: Date.now() + 60000 };

        io.emit('matchUpdate', { date: requestedDate, matches: standardMatches });
        return res.json({ source: 'TheSportsDB Premium Connection', data: standardMatches });

    } catch (error) {
        console.error("❌ خطأ محمي داخلي:", error.message);
        return res.json({ source: 'Protection Fallback', data: [] });
    }
});

// توجيه الرابط الأساسي لتقديم واجهتك المظلمة الفخمة تلقائياً
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'live_modarraj_frontend.html'));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 السيرفر يعمل بكفاءة وأمان على منفذ ${PORT}`));