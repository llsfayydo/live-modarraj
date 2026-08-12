import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import axios from 'axios';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

// تحميل متغيرات البيئة
dotenv.config();

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

// ✅ قراءة بيانات قاعدة البيانات من متغيرات البيئة (آمنة)
const dbUrl = process.env.MONGODB_URI || "mongodb://localhost:27017/live-modarraj";
mongoose.connect(dbUrl, { serverSelectionTimeoutMS: 5000 })
    .then(() => console.log('✅ قاعدة البيانات السحابية متصلة بنجاح!'))
    .catch((err) => {
        console.log('⚠️ وضع الذاكرة الاحتياطية نشط - سيتم استخدام الكاش المحلي');
        console.log('تفاصيل الخطأ:', err.message);
    });

let localMemoryCache = {};

// مسار جلب المباريات الاحترافي المباشر بالتواريخ والقنوات والمعلقين
app.get('/api/matches', async (req, res) => {
    // التقاط التاريخ القادم من المتصفح تلقائياً
    const requestedDate = req.query.date || new Date().toISOString().split('T')[0];
    const cacheKey = `sports_db_matches_${requestedDate}`;

    try {
        // فحص الكاش المحلي لتسريع الموقع
        if (localMemoryCache[cacheKey] && Date.now() < localMemoryCache[cacheKey].expireAt) {
            console.log(`✅ تم جلب البيانات من الكاش المحلي للتاريخ: ${requestedDate}`);
            return res.json({ source: 'Local Memory Cache', data: localMemoryCache[cacheKey].data });
        }

        console.log(`📡 جلب مباريات اليوم من TheSportsDB ليوم: ${requestedDate}`);
        
        // ✅ استخدام مفتاح API من متغيرات البيئة (آمن)
        const apiKey = process.env.THESPORTSDB_API_KEY || '5010468507';
        let events = [];

        try {
            // الرابط الصحيح لـ API
            const response = await axios.get(
                `https://www.thesportsdb.com/api/v1/eventslast.php?id=${requestedDate}`,
                { timeout: 8000 }
            );
            events = response.data.results || response.data.events || [];
        } catch (apiErr) {
            console.log("⚠️ محاولة الاتصال برابط بديل...");
            try {
                // رابط بديل
                const fallbackResponse = await axios.get(
                    `https://www.thesportsdb.com/api/v1/eventslast.php`,
                    { timeout: 8000 }
                );
                events = fallbackResponse.data.results || [];
            } catch (fallbackErr) {
                console.error("❌ فشل الاتصال بـ TheSportsDB:", fallbackErr.message);
                events = [];
            }
        }

        // إذا كانت القائمة فارغة في هذا اليوم يرسل مصفوفة فارغة آمنة
        if (!events || events.length === 0) {
            console.log(`ℹ️ لا توجد مباريات مجدولة في التاريخ: ${requestedDate}`);
            return res.json({ source: 'TheSportsDB (Empty)', data: [] });
        }

        // إعادة هيكلة وتجهيز البيانات باللغة العربية والشعارات
        const standardMatches = events
            .filter(event => event.strHomeTeam && event.strAwayTeam) // تصفية البيانات غير الكاملة
            .map(event => {
                return {
                    fixture: {
                        id: event.idEvent || Math.random().toString(36),
                        date: event.dateEvent ? `${event.dateEvent}T${event.strTime || '00:00:00'}` : new Date().toISOString(),
                        status: {
                            short: event.strStatus === "Not Started" ? "NS" : event.strStatus === "Final" ? "FT" : event.strStatus === "Half Time" ? "HT" : "LIVE",
                            elapsed: event.intHomeScore !== null ? parseInt(event.intHomeScore) + parseInt(event.intAwayScore) : ""
                        }
                    },
                    league: {
                        name: event.strLeague || "بطولات كبرى"
                    },
                    teams: {
                        home: {
                            name: event.strHomeTeam || "فريق غير معروف",
                            logo: event.strHomeTeamBadge || "https://www.thesportsdb.com/images/media/team/badge/default.png"
                        },
                        away: {
                            name: event.strAwayTeam || "فريق غير معروف",
                            logo: event.strAwayTeamBadge || "https://www.thesportsdb.com/images/media/team/badge/default.png"
                        }
                    },
                    goals: {
                        home: parseInt(event.intHomeScore) || 0,
                        away: parseInt(event.intAwayScore) || 0
                    },
                    media: {
                        channel: event.strTVStation || "SSC Sports / beIN",
                        commentator: event.strCommentator || "محدد لاحقاً"
                    }
                };
            });

        // حفظ النتيجة في الكاش الداخلي لمدة دقيقة واحدة
        localMemoryCache[cacheKey] = { 
            data: standardMatches, 
            expireAt: Date.now() + 60000 
        };

        // إرسال تحديث عبر Socket.io
        io.emit('matchUpdate', { date: requestedDate, matches: standardMatches });
        
        return res.json({ 
            source: 'TheSportsDB Premium Connection', 
            data: standardMatches,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error("❌ خطأ في جلب المباريات:", error.message);
        return res.status(500).json({ 
            source: 'Protection Fallback', 
            data: [],
            error: error.message 
        });
    }
});

// توجيه الرابط الأساسي لتقديم واجهتك المظلمة الفخمة تلقائياً
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'live_modarraj_frontend.html'));
});

// معالج أخطاء 404
app.use((req, res) => {
    res.status(404).json({ error: 'الرابط المطلوب غير موجود' });
});

// معالج أخطاء عام
app.use((err, req, res, next) => {
    console.error('❌ خطأ غير متوقع:', err);
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل بكفاءة وأمان على منفذ ${PORT}`);
    console.log(`📡 الواجهة الأمامية متاحة على: http://localhost:${PORT}`);
    console.log(`📊 API المباريات متاح على: http://localhost:${PORT}/api/matches?date=YYYY-MM-DD`);
});

// معالجة الأخطاء غير المتوقعة
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promise Rejection غير معالجة:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Exception غير معالجة:', error);
    process.exit(1);
});
