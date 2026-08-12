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

// دالة تحويل التاريخ من YYYY-MM-DD إلى DD.MM.YYYY
const formatDateForTheSportsDB = (dateString) => {
    try {
        // إذا كان التاريخ بصيغة YYYY-MM-DD
        if (dateString.includes('-')) {
            const [year, month, day] = dateString.split('-');
            return `${day}.${month}.${year}`; // تحويل إلى DD.MM.YYYY
        }
        return dateString; // إذا كان بصيغة صحيحة بالفعل
    } catch (e) {
        console.error('خطأ في تحويل التاريخ:', e);
        return dateString;
    }
};

// قائمة الدوريات الرئيسية
const LEAGUES = [
    'English Premier League',
    'Serie A',
    'La Liga',
    'Ligue 1',
    'Bundesliga',
    'Saudi Professional League',
    'Egyptian Premier League',
    'UEFA Champions League'
];

// مسار جلب المباريات الاحترافي المباشر بالتواريخ والقنوات والمعلقين
app.get('/api/matches', async (req, res) => {
    // التقاط التاريخ القادم من المتصفح تلقائياً
    const requestedDate = req.query.date || new Date().toISOString().split('T')[0];
    const cacheKey = `sports_db_matches_${requestedDate}`;

    try {
        // فحص الكاش المحلي لتسريع الموقع
        if (localMemoryCache[cacheKey] && Date.now() < localMemoryCache[cacheKey].expireAt) {
            console.log(`✅ تم جلب البيانات من الكاش المحلي للتاريخ: ${requestedDate}`);
            return res.json({ 
                source: 'Local Memory Cache', 
                data: localMemoryCache[cacheKey].data,
                cached: true,
                count: localMemoryCache[cacheKey].data.length
            });
        }

        console.log(`\n📡 جلب مباريات من TheSportsDB ليوم: ${requestedDate}`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        
        let allEvents = [];
        const apiKey = process.env.THESPORTSDB_API_KEY || '5010468507';
        
        // تحويل التاريخ إلى الصيغة الصحيحة
        const formattedDate = formatDateForTheSportsDB(requestedDate);
        console.log(`📅 التاريخ الأصلي: ${requestedDate}`);
        console.log(`📅 التاريخ بصيغة API: ${formattedDate}`);
        console.log(`🔑 مفتاح API: ${apiKey.substring(0, 5)}...`);

        // محاولة جلب المباريات من كل دوري
        for (const league of LEAGUES) {
            try {
                console.log(`\n🔗 جاري جلب مباريات: ${league}`);
                
                // استخدام الصيغة الصحيحة للرابط
                const url = `https://www.thesportsdb.com/api/v1/json/${apiKey}/eventsday.php?d=${formattedDate}&l=${encodeURIComponent(league)}`;
                
                console.log(`   🌐 الرابط: ${url.substring(0, 120)}...`);
                
                const response = await axios.get(url, { 
                    timeout: 12000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
                
                console.log(`   ✅ حالة الرد: ${response.status}`);
                
                if (response.data && response.data.results) {
                    const leagueEvents = Array.isArray(response.data.results) 
                        ? response.data.results 
                        : [response.data.results];
                    
                    // تصفية النتائج الفارغة
                    const validEvents = leagueEvents.filter(e => e && e.strHomeTeam && e.strAwayTeam);
                    console.log(`   📊 النتائج: ${validEvents.length} مبارة صحيحة`);
                    
                    allEvents = allEvents.concat(validEvents);
                } else {
                    console.log(`   ⚠️ لا توجد نتائج في الرد`);
                }
            } catch (err) {
                console.log(`   ❌ خطأ: ${err.message}`);
                if (err.response) {
                    console.log(`   📍 حالة الخطأ: ${err.response.status}`);
                }
                // المتابعة مع الدوريات التالية
                continue;
            }
        }

        console.log(`\n📊 إجمالي المباريات المجلوبة: ${allEvents.length}`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

        // إذا كانت النتيجة فارغة، إعادة بيانات عينة
        if (!allEvents || allEvents.length === 0) {
            console.log(`⚠️ لم يتم جلب مباريات حقيقية، سيتم عرض بيانات تجريبية`);
            
            const demoMatches = [
                {
                    idEvent: "demo001",
                    strHomeTeam: "الاتحاد السعودي",
                    strAwayTeam: "الهلال",
                    strLeague: "الدوري السعودي",
                    intHomeScore: 0,
                    intAwayScore: 0,
                    strStatus: "Not Started",
                    strTVStation: "SSC Sports",
                    dateEvent: requestedDate,
                    strTime: "20:00",
                    strHomeTeamBadge: "https://www.thesportsdb.com/images/media/team/badge/default.png",
                    strAwayTeamBadge: "https://www.thesportsdb.com/images/media/team/badge/default.png"
                },
                {
                    idEvent: "demo002",
                    strHomeTeam: "الأهلي",
                    strAwayTeam: "الزمالك",
                    strLeague: "الدوري المصري",
                    intHomeScore: 0,
                    intAwayScore: 0,
                    strStatus: "Not Started",
                    strTVStation: "beIN Sports",
                    dateEvent: requestedDate,
                    strTime: "19:00",
                    strHomeTeamBadge: "https://www.thesportsdb.com/images/media/team/badge/default.png",
                    strAwayTeamBadge: "https://www.thesportsdb.com/images/media/team/badge/default.png"
                }
            ];
            
            allEvents = demoMatches;
        }

        // إعادة هيكلة وتجهيز البيانات باللغة العربية والشعارات
        const standardMatches = allEvents
            .filter(event => event && event.strHomeTeam && event.strAwayTeam)
            .map((event, index) => {
                const homeScore = parseInt(event.intHomeScore) || 0;
                const awayScore = parseInt(event.intAwayScore) || 0;
                
                return {
                    fixture: {
                        id: event.idEvent || `match-${index}`,
                        date: event.dateEvent ? `${event.dateEvent}T${event.strTime || '00:00:00'}` : new Date().toISOString(),
                        status: {
                            short: event.strStatus === "Not Started" ? "NS" : 
                                   event.strStatus === "Final" ? "FT" : 
                                   event.strStatus === "Half Time" ? "HT" : "LIVE",
                            elapsed: event.strProgress || ""
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
                        home: homeScore,
                        away: awayScore
                    },
                    media: {
                        channel: event.strTVStation || "SSC Sports / beIN",
                        commentator: event.strCommentator || "محدد لاحقاً"
                    }
                };
            });

        console.log(`✅ تم معالجة ${standardMatches.length} مبارة\n`);

        // حفظ النتيجة في الكاش الداخلي لمدة دقيقة واحدة
        localMemoryCache[cacheKey] = { 
            data: standardMatches, 
            expireAt: Date.now() + 60000 
        };

        // إرسال تحديث عبر Socket.io
        io.emit('matchUpdate', { date: requestedDate, matches: standardMatches });
        
        return res.json({ 
            source: 'TheSportsDB API', 
            data: standardMatches,
            count: standardMatches.length,
            date: requestedDate,
            timestamp: new Date().toISOString(),
            cached: false
        });

    } catch (error) {
        console.error("❌ خطأ عام في جلب المباريات:", error.message);
        if (error.response) {
            console.error("📍 حالة الخطأ:", error.response.status);
            console.error("📝 البيانات:", error.response.data);
        }
        
        return res.status(500).json({ 
            source: 'Error', 
            data: [],
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// توجيه الرابط الأساسي لتقديم واجهتك المظلمة الفخمة تلقائياً
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'live_modarraj_frontend.html'));
});

// endpoint للتحقق من حالة السيرفر
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok',
        message: 'السيرفر يعمل بشكل طبيعي',
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'development',
        apiKey: process.env.THESPORTSDB_API_KEY ? '✅ موجود' : '❌ غير موجود',
        timestamp: new Date().toISOString()
    });
});

// endpoint جديد: اختبار اتصال API
app.get('/api/test', async (req, res) => {
    try {
        const apiKey = process.env.THESPORTSDB_API_KEY || '5010468507';
        const testDate = '12.08.2026';
        const testUrl = `https://www.thesportsdb.com/api/v1/json/${apiKey}/eventsday.php?d=${testDate}&l=English%20Premier%20League`;
        
        console.log(`🧪 اختبار الاتصال بـ TheSportsDB...`);
        console.log(`📍 الرابط: ${testUrl}`);
        
        const response = await axios.get(testUrl, { timeout: 10000 });
        
        res.json({
            status: 'success',
            message: 'اتصال API يعمل بشكل صحيح',
            apiKey: apiKey.substring(0, 5) + '...',
            responseStatus: response.status,
            dataCount: response.data.results ? (Array.isArray(response.data.results) ? response.data.results.length : 1) : 0,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'فشل اختبار الاتصال',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// معالج أخطاء 404
app.use((req, res) => {
    res.status(404).json({ 
        error: 'الرابط المطلوب غير موجود',
        path: req.path,
        method: req.method
    });
});

// معالج أخطاء عام
app.use((err, req, res, next) => {
    console.error('❌ خطأ غير متوقع:', err);
    res.status(500).json({ 
        error: 'حدث خطأ في السيرفر',
        message: err.message 
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🚀 السيرفر يعمل بكفاءة وأمان على منفذ ${PORT}`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`📡 الواجهة الأمامية متاحة على: http://localhost:${PORT}`);
    console.log(`📊 API المباريات متاح على: http://localhost:${PORT}/api/matches?date=YYYY-MM-DD`);
    console.log(`💚 حالة السيرفر: http://localhost:${PORT}/api/health`);
    console.log(`🧪 اختبار API: http://localhost:${PORT}/api/test`);
    console.log(`${'═'.repeat(60)}\n`);
});

// معالجة الأخطاء غير المتوقعة
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promise Rejection غير معالجة:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Exception غير معالجة:', error);
    process.exit(1);
});
