import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(__dirname));

/* =========================================================
   ENV
========================================================= */

const PORT = process.env.PORT || 5000;

const API_KEY =
  process.env.THESPORTSDB_API_KEY;

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.MONGODB_URI;

/* =========================================================
   CACHE
========================================================= */

const cache = new Map();

const CACHE_TIME = 30 * 1000;

/* =========================================================
   AXIOS
========================================================= */

const api = axios.create({
  timeout: 20000,

  headers: {
    "User-Agent": "Live-Modarraj/1.0",
    Accept: "application/json"
  }
});

/* =========================================================
   DATABASE
========================================================= */

if (DATABASE_URL) {
  mongoose
    .connect(DATABASE_URL, {
      serverSelectionTimeoutMS: 10000
    })
    .then(() => {
      console.log("✅ MongoDB متصل");
    })
    .catch((error) => {
      console.error(
        "⚠️ MongoDB:",
        error.message
      );
    });
} else {
  console.log(
    "ℹ️ يعمل بدون MongoDB"
  );
}

/* =========================================================
   ARABIC LEAGUES
========================================================= */

const ARABIC_LEAGUES = {

  "Saudi-Arabian Pro League":
    "الدوري السعودي للمحترفين",

  "Saudi Professional League":
    "الدوري السعودي للمحترفين",

  "Premier League":
    "الدوري الإنجليزي الممتاز",

  "English Premier League":
    "الدوري الإنجليزي الممتاز",

  "La Liga":
    "الدوري الإسباني",

  "Serie A":
    "الدوري الإيطالي",

  "Bundesliga":
    "الدوري الألماني",

  "Ligue 1":
    "الدوري الفرنسي",

  "UEFA Champions League":
    "دوري أبطال أوروبا",

  "UEFA Europa League":
    "الدوري الأوروبي",

  "UEFA Europa Conference League":
    "دوري المؤتمر الأوروبي",

  "CAF Champions League":
    "دوري أبطال أفريقيا",

  "AFC Champions League":
    "دوري أبطال آسيا",

  "AFC Champions League Elite":
    "دوري أبطال آسيا للنخبة",

  "FIFA World Cup":
    "كأس العالم",

  "King Cup":
    "كأس الملك",

  "Saudi Kings Cup":
    "كأس خادم الحرمين الشريفين"
};

/* =========================================================
   ARABIC TEAMS
========================================================= */

const ARABIC_TEAMS = {

  "Al-Hilal":
    "الهلال",

  "Al Hilal":
    "الهلال",

  "Al-Hilal Riyadh":
    "الهلال",

  "Al-Nassr":
    "النصر",

  "Al Nassr":
    "النصر",

  "Al-Nassr Riyadh":
    "النصر",

  "Al-Ittihad":
    "الاتحاد",

  "Al Ittihad":
    "الاتحاد",

  "Al-Ahli":
    "الأهلي",

  "Al Ahli":
    "الأهلي",

  "Al-Shabab":
    "الشباب",

  "Al Shabab":
    "الشباب",

  "Al-Ettifaq":
    "الاتفاق",

  "Al Ettifaq":
    "الاتفاق",

  "Al-Taawoun":
    "التعاون",

  "Al Taawoun":
    "التعاون",

  "Al-Fateh":
    "الفتح",

  "Al Fateh":
    "الفتح",

  "Al-Raed":
    "الرائد",

  "Al Raed":
    "الرائد",

  "Al-Wehda":
    "الوحدة",

  "Al Wehda":
    "الوحدة",

  "Al-Khaleej":
    "الخليج",

  "Al Khaleej":
    "الخليج",

  "Al-Okhdood":
    "الأخدود",

  "Al Okhdood":
    "الأخدود",

  "Al-Qadsiah":
    "القادسية",

  "Al Qadsiah":
    "القادسية",

  "Real Madrid":
    "ريال مدريد",

  "Barcelona":
    "برشلونة",

  "Atletico Madrid":
    "أتلتيكو مدريد",

  "Manchester City":
    "مانشستر سيتي",

  "Manchester United":
    "مانشستر يونايتد",

  "Liverpool":
    "ليفربول",

  "Arsenal":
    "أرسنال",

  "Chelsea":
    "تشيلسي",

  "Tottenham Hotspur":
    "توتنهام",

  "Bayern Munich":
    "بايرن ميونخ",

  "Borussia Dortmund":
    "بوروسيا دورتموند",

  "Paris Saint-Germain":
    "باريس سان جيرمان",

  "PSG":
    "باريس سان جيرمان",

  "Juventus":
    "يوفنتوس",

  "Inter Milan":
    "إنتر ميلان",

  "AC Milan":
    "ميلان",

  "Napoli":
    "نابولي",

  "Roma":
    "روما"
};

/* =========================================================
   TRANSLATION
========================================================= */

function translateTeam(name) {

  if (!name) {
    return "فريق غير معروف";
  }

  const clean =
    String(name).trim();

  return (
    ARABIC_TEAMS[clean] ||
    clean
  );
}

function translateLeague(name) {

  if (!name) {
    return "بطولة أخرى";
  }

  const clean =
    String(name).trim();

  return (
    ARABIC_LEAGUES[clean] ||
    clean
  );
}

/* =========================================================
   IMPORTANT LEAGUES
========================================================= */

const IMPORTANT_LEAGUES = {

  "4480": 100, // UEFA Champions League

  "4328": 95,  // Premier League

  "4335": 90,  // La Liga

  "4332": 90,  // Serie A

  "4331": 90,  // Bundesliga

  "4334": 85,  // Ligue 1

  "4668": 100  // Saudi Pro League
};

/* =========================================================
   IMPORTANT TEAMS
========================================================= */

const IMPORTANT_TEAM_NAMES = [

  "al-hilal",
  "al hilal",

  "al-nassr",
  "al nassr",

  "al-ittihad",
  "al ittihad",

  "al-ahli",
  "al ahli",

  "real madrid",
  "barcelona",

  "manchester city",
  "manchester united",

  "liverpool",
  "arsenal",
  "chelsea",

  "bayern munich",

  "paris saint-germain",
  "psg",

  "juventus",
  "inter milan",
  "ac milan"
];

/* =========================================================
   TEAM PRIORITY
========================================================= */

function teamPriority(event) {

  const home =
    String(
      event.strHomeTeam || ""
    ).toLowerCase();

  const away =
    String(
      event.strAwayTeam || ""
    ).toLowerCase();

  let score = 0;

  for (
    const team
    of IMPORTANT_TEAM_NAMES
  ) {

    if (
      home.includes(team)
    ) {
      score += 25;
    }

    if (
      away.includes(team)
    ) {
      score += 25;
    }
  }

  return score;
}

/* =========================================================
   STATUS
========================================================= */

function normalizeStatus(event) {

  const status =
    String(
      event.strStatus ||
      ""
    )
    .trim()
    .toUpperCase();

  const progress =
    String(
      event.strProgress ||
      ""
    )
    .trim()
    .toUpperCase();

  if (
    [
      "1H",
      "2H",
      "LIVE",
      "ET",
      "P"
    ].includes(status)
  ) {
    return "LIVE";
  }

  if (
    status === "HT" ||
    progress.includes("HALF")
  ) {
    return "HT";
  }

  if (
    [
      "FT",
      "FINAL",
      "AET",
      "PEN"
    ].includes(status) ||
    progress === "FINAL"
  ) {
    return "FT";
  }

  return "NS";
}

/* =========================================================
   PRIORITY
========================================================= */

function calculatePriority(event) {

  const leagueId =
    String(
      event.idLeague ||
      ""
    );

  let score =
    IMPORTANT_LEAGUES[
      leagueId
    ] || 30;

  score +=
    teamPriority(event);

  const status =
    normalizeStatus(event);

  if (status === "LIVE") {
    score += 1000;
  }

  if (status === "HT") {
    score += 900;
  }

  if (status === "FT") {
    score += 5;
  }

  return score;
}

/* =========================================================
   NORMALIZE EVENT
========================================================= */

function normalizeEvent(
  event,
  source = "TheSportsDB"
) {

  const status =
    normalizeStatus(event);

  const date =
    event.dateEvent ||
    event.strEventDate ||
    "";

  const time =
    event.strEventTime ||
    event.strTime ||
    "00:00:00";

  return {

    fixture: {

      id:
        event.idEvent ||
        event.idLiveScore ||
        `${event.idHomeTeam}-${event.idAwayTeam}-${date}`,

      date:
        `${date}T${time}`,

      status: {

        short:
          status,

        elapsed:
          event.strProgress ||
          ""
      }
    },

    league: {

      id:
        String(
          event.idLeague ||
          ""
        ),

      name:
        translateLeague(
          event.strLeague
        ),

      originalName:
        event.strLeague ||
        "",

      country:
        event.strCountry ||
        ""
    },

    teams: {

      home: {

        name:
          translateTeam(
            event.strHomeTeam
          ),

        originalName:
          event.strHomeTeam ||
          "",

        logo:
          event.strHomeTeamBadge ||
          ""
      },

      away: {

        name:
          translateTeam(
            event.strAwayTeam
          ),

        originalName:
          event.strAwayTeam ||
          "",

        logo:
          event.strAwayTeamBadge ||
          ""
      }
    },

    goals: {

      home:
        event.intHomeScore ??
        0,

      away:
        event.intAwayScore ??
        0
    },

    media: {

      channel:
        event.strTVStation ||
        "",

      commentator:
        event.strCommentator ||
        ""
    },

    venue:
      event.strVenue ||
      "",

    city:
      event.strCity ||
      "",

    priority:
      calculatePriority(event),

    source
  };
}

/* =========================================================
   V1 - EVENTS DAY
========================================================= */

async function fetchEventsDay(date) {

  if (!API_KEY) {
    throw new Error(
      "THESPORTSDB_API_KEY غير موجود"
    );
  }

  const url =
    `https://www.thesportsdb.com/api/v1/json/` +
    `${API_KEY}/eventsday.php` +
    `?d=${encodeURIComponent(date)}` +
    `&s=Soccer`;

  console.log(
    `📅 V1 eventsday: ${date}`
  );

  try {

    const response =
      await api.get(url);

    const events =
      response.data?.events;

    if (
      !Array.isArray(events)
    ) {
      return [];
    }

    return events;

  } catch (error) {

    console.error(
      "❌ eventsday:",
      error.message
    );

    return [];
  }
}

/* =========================================================
   V2 - LIVE SCORES
========================================================= */

async function fetchLiveScores() {

  if (!API_KEY) {
    return [];
  }

  const url =
    "https://www.thesportsdb.com/api/v2/json/livescore/soccer";

  console.log(
    "🔴 V2 Livescore"
  );

  try {

    const response =
      await api.get(
        url,
        {
          headers: {
            "X-API-KEY":
              API_KEY,

            "Content-Type":
              "application/json"
          }
        }
      );

    /*
      V2 قد يرجع:
      livescores
      أو events
      حسب نسخة الاستجابة.
    */

    const data =
      response.data;

    if (
      Array.isArray(data)
    ) {
      return data;
    }

    if (
      Array.isArray(
        data?.livescores
      )
    ) {
      return data.livescores;
    }

    if (
      Array.isArray(
        data?.events
      )
    ) {
      return data.events;
    }

    if (
      Array.isArray(
        data?.data
      )
    ) {
      return data.data;
    }

    return [];

  } catch (error) {

    console.error(
      "❌ V2 Livescore:",
      error.response?.status ||
      error.message
    );

    return [];
  }
}

/* =========================================================
   V2 - NEXT IMPORTANT LEAGUE EVENTS
========================================================= */

async function fetchNextLeagueEvents(
  leagueId
) {

  if (!API_KEY) {
    return [];
  }

  const url =
    `https://www.thesportsdb.com/api/v2/json/schedule/next/league/${leagueId}`;

  try {

    const response =
      await api.get(
        url,
        {
          headers: {
            "X-API-KEY":
              API_KEY,

            "Content-Type":
              "application/json"
          }
        }
      );

    const data =
      response.data;

    if (
      Array.isArray(data)
    ) {
      return data;
    }

    if (
      Array.isArray(
        data?.events
      )
    ) {
      return data.events;
    }

    if (
      Array.isArray(
        data?.data
      )
    ) {
      return data.data;
    }

    return [];

  } catch (error) {

    console.error(
      `⚠️ League ${leagueId}:`,
      error.response?.status ||
      error.message
    );

    return [];
  }
}

/* =========================================================
   FALLBACK SCHEDULE
========================================================= */

async function fetchImportantSchedules(
  requestedDate
) {

  const leagueIds =
    Object.keys(
      IMPORTANT_LEAGUES
    );

  const results = [];

  /*
     لا نريد أكثر من عدد صغير من الطلبات.
     Premium يسمح بـ100 طلب/دقيقة.
  */

  const responses =
    await Promise.allSettled(

      leagueIds.map(
        id =>
          fetchNextLeagueEvents(id)
      )
    );

  for (
    const result
    of responses
  ) {

    if (
      result.status !==
      "fulfilled"
    ) {
      continue;
    }

    for (
      const event
      of result.value
    ) {

      if (!event) {
        continue;
      }

      const eventDate =
        event.dateEvent ||
        event.strEventDate ||
        "";

      if (
        eventDate ===
        requestedDate
      ) {

        results.push(event);
      }
    }
  }

  return results;
}

/* =========================================================
   MERGE
========================================================= */

function mergeEvents(
  arrays
) {

  const map =
    new Map();

  for (
    const events
    of arrays
  ) {

    for (
      const event
      of events
    ) {

      if (!event) {
        continue;
      }

      const id =
        event.idEvent ||
        event.idLiveScore ||
        `${event.idHomeTeam}-${event.idAwayTeam}-${event.dateEvent}`;

      if (!id) {
        continue;
      }

      /*
        إذا كان Livescore موجوداً
        فهو أحدث من Schedule.
      */

      const existing =
        map.get(id);

      if (!existing) {

        map.set(
          id,
          event
        );

      } else {

        const live =
          normalizeStatus(event);

        if (
          live === "LIVE" ||
          live === "HT"
        ) {

          map.set(
            id,
            event
          );
        }
      }
    }
  }

  return Array.from(
    map.values()
  );
}

/* =========================================================
   SORT
========================================================= */

function sortMatches(
  matches
) {

  return matches.sort(
    (a, b) => {

      const liveA =
        ["LIVE", "HT"]
          .includes(
            a.fixture.status.short
          )
          ? 1
          : 0;

      const liveB =
        ["LIVE", "HT"]
          .includes(
            b.fixture.status.short
          )
          ? 1
          : 0;

      if (
        liveA !== liveB
      ) {

        return (
          liveB -
          liveA
        );
      }

      if (
        b.priority !==
        a.priority
      ) {

        return (
          b.priority -
          a.priority
        );
      }

      return (
        new Date(
          a.fixture.date
        ) -
        new Date(
          b.fixture.date
        )
      );
    }
  );
}

/* =========================================================
   GET MATCHES
========================================================= */

async function getMatches(
  requestedDate
) {

  const cacheKey =
    `matches:${requestedDate}`;

  const cached =
    cache.get(cacheKey);

  if (
    cached &&
    Date.now() <
      cached.expiresAt
  ) {

    return {
      data:
        cached.data,

      cached:
        true
    };
  }

  /*
     1. مباريات اليوم
  */

  const dayEvents =
    await fetchEventsDay(
      requestedDate
    );

  /*
     2. المباريات المباشرة
  */

  const liveEvents =
    await fetchLiveScores();

  /*
     لا نريد livescore من يوم آخر
     إلا إذا كان التاريخ المطلوب هو اليوم.
  */

  const today =
    new Date()
      .toISOString()
      .split("T")[0];

  const filteredLive =
    requestedDate === today
      ? liveEvents
      : [];

  /*
     3. fallback للدوريات المهمة
  */

  let scheduleEvents = [];

  if (
    dayEvents.length === 0
  ) {

    console.log(
      "ℹ️ لا توجد نتائج eventsday، تشغيل fallback"
    );

    scheduleEvents =
      await fetchImportantSchedules(
        requestedDate
      );
  }

  /*
     4. دمج
  */

  const rawEvents =
    mergeEvents([
      dayEvents,
      scheduleEvents,
      filteredLive
    ]);

  /*
     5. تحويل
  */

  let matches =
    rawEvents.map(
      (event) =>
        normalizeEvent(
          event,
          filteredLive.includes(event)
            ? "V2 Livescore"
            : "TheSportsDB"
        )
    );

  /*
     6. إزالة التكرار
  */

  matches =
    Array.from(
      new Map(
        matches.map(
          match => [
            match.fixture.id,
            match
          ]
        )
      ).values()
    );

  /*
     7. ترتيب حسب أهمية الزائر
  */

  matches =
    sortMatches(
      matches
    );

  /*
     8. Cache
  */

  cache.set(
    cacheKey,
    {
      data:
        matches,

      expiresAt:
        Date.now() +
        CACHE_TIME
    }
  );

  return {
    data:
      matches,

    cached:
      false
  };
}

/* =========================================================
   API MATCHES
========================================================= */

app.get(
  "/api/matches",
  async (req, res) => {

    const requestedDate =
      req.query.date ||
      new Date()
        .toISOString()
        .split("T")[0];

    if (
      !/^\d{4}-\d{2}-\d{2}$/
        .test(requestedDate)
    ) {

      return res.status(400).json({

        source:
          "Validation",

        data: [],

        count: 0,

        error:
          "التاريخ يجب أن يكون YYYY-MM-DD"
      });
    }

    try {

      const result =
        await getMatches(
          requestedDate
        );

      io.emit(
        "matchUpdate",
        {
          date:
            requestedDate,

          matches:
            result.data
        }
      );

      return res.json({

        source:
          result.cached
            ? "Local Cache"
            : "TheSportsDB API",

        data:
          result.data,

        count:
          result.data.length,

        date:
          requestedDate,

        cached:
          result.cached,

        timestamp:
          new Date().toISOString()
      });

    } catch (error) {

      console.error(
        "❌ /api/matches:",
        error
      );

      return res.status(500).json({

        source:
          "Server Error",

        data: [],

        count: 0,

        error:
          error.message
      });
    }
  }
);

/* =========================================================
   TEST
========================================================= */

app.get(
  "/api/test",
  async (req, res) => {

    const date =
      new Date()
        .toISOString()
        .split("T")[0];

    const result = {

      date,

      v1EventsDay: 0,

      v2Livescores: 0,

      fallbackSchedule: 0,

      finalMatches: 0
    };

    try {

      const day =
        await fetchEventsDay(
          date
        );

      result.v1EventsDay =
        day.length;

      const live =
        await fetchLiveScores();

      result.v2Livescores =
        live.length;

      if (
        day.length === 0
      ) {

        const fallback =
          await fetchImportantSchedules(
            date
          );

        result.fallbackSchedule =
          fallback.length;
      }

      const matches =
        await getMatches(
          date
        );

      result.finalMatches =
        matches.data.length;

      return res.json({

        status:
          "success",

        message:
          "اختبار مصادر TheSportsDB اكتمل",

        ...result,

        timestamp:
          new Date().toISOString()
      });

    } catch (error) {

      return res.status(500).json({

        status:
          "error",

        error:
          error.message,

        ...result
      });
    }
  }
);

/* =========================================================
   V2 LIVE TEST
========================================================= */

app.get(
  "/api/test/live",
  async (req, res) => {

    try {

      const live =
        await fetchLiveScores();

      return res.json({

        status:
          "success",

        source:
          "TheSportsDB V2 Livescore",

        matches:
          live.length,

        data:
          live

      });

    } catch (error) {

      return res.status(502).json({

        status:
          "error",

        error:
          error.message

      });
    }
  }
);

/* =========================================================
   HEALTH
========================================================= */

app.get(
  "/api/health",
  (req, res) => {

    res.json({

      status:
        "ok",

      server:
        "Live Modarraj",

      apiKey:
        API_KEY
          ? "موجود"
          : "غير موجود",

      database:
        DATABASE_URL
          ? "موجود"
          : "غير موجود",

      mongodb:
        mongoose.connection.readyState,

      v2:
        API_KEY
          ? "جاهز"
          : "غير جاهز",

      timestamp:
        new Date().toISOString()
    });
  }
);

/* =========================================================
   FAVICON
========================================================= */

app.get(
  "/favicon.ico",
  (req, res) => {

    res.status(204).end();

  }
);

/* =========================================================
   HOME
========================================================= */

app.get(
  "/",
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        "live_modarraj_frontend.render.html"
      )
    );
  }
);

/* =========================================================
   SOCKET
========================================================= */

io.on(
  "connection",
  (socket) => {

    console.log(
      `🔌 اتصال: ${socket.id}`
    );

    socket.on(
      "disconnect",
      () => {

        console.log(
          `🔌 خروج: ${socket.id}`
        );

      }
    );
  }
);

/* =========================================================
   404
========================================================= */

app.use(
  (req, res) => {

    res.status(404).json({

      error:
        "الرابط غير موجود",

      path:
        req.path

    });
  }
);

/* =========================================================
   START
========================================================= */

server.listen(
  PORT,
  () => {

    console.log(
      "================================="
    );

    console.log(
      `🚀 Live Modarraj يعمل على ${PORT}`
    );

    console.log(
      `🔐 API Key: ${
        API_KEY
          ? "موجود"
          : "❌ غير موجود"
      }`
    );

    console.log(
      `🗄️ Database: ${
        DATABASE_URL
          ? "موجود"
          : "غير موجود"
      }`
    );

    console.log(
      "================================="
    );
  }
);

/* =========================================================
   ERRORS
========================================================= */

process.on(
  "unhandledRejection",
  (reason) => {

    console.error(
      "❌ Unhandled Rejection:",
      reason
    );

  }
);

process.on(
  "uncaughtException",
  (error) => {

    console.error(
      "❌ Uncaught Exception:",
      error
    );

    process.exit(1);
  }
);
