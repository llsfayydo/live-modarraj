import express from "express";
import http from "http";
import { Server } from "socket.io";
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
    methods: ["GET"]
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5000;
const API_KEY = process.env.THESPORTSDB_API_KEY;

app.use(express.json());
app.use(express.static(__dirname));

const api = axios.create({
  timeout: 20000,
  headers: {
    "User-Agent": "Live-Modarraj/1.0",
    "Accept": "application/json"
  }
});

/* =========================
   Memory Cache
========================= */

const cache = new Map();
const CACHE_TIME = 30 * 1000;

/* =========================
   League Priority
========================= */

const LEAGUE_PRIORITY = {
  "FIFA World Cup": 110,
  "World Cup": 110,

  "AFC Asian Cup": 105,
  "Asian Cup": 105,

  "Africa Cup of Nations": 103,

  "UEFA Champions League": 100,
  "UEFA Europa League": 95,
  "UEFA Europa Conference League": 90,

  "English Premier League": 88,
  "Premier League": 88,

  "La Liga": 86,
  "Serie A": 84,
  "Bundesliga": 82,
  "Ligue 1": 80,

  "Saudi Professional League": 78,
  "Saudi-Arabian Pro League": 78,
  "Saudi Pro League": 78,

  "AFC Champions League Elite": 75,
  "AFC Champions League": 74,
  "CAF Champions League": 73,

  "Moroccan Botola": 72,
  "Botola Pro": 72,

  "Egyptian Premier League": 70,
  "Qatar Stars League": 68,
  "UAE Pro League": 66,
  "Iraq Stars League": 64,
  "Kuwait Premier League": 62,
  "Tunisian Ligue 1": 60,
  "Algeria Ligue 1": 58
};

/* =========================
   Important Teams
========================= */

const TEAM_PRIORITY = [
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
  "atletico madrid",

  "manchester city",
  "manchester united",
  "liverpool",
  "arsenal",
  "chelsea",
  "tottenham",

  "bayern munich",
  "borussia dortmund",

  "paris saint-germain",
  "psg",

  "juventus",
  "inter milan",
  "ac milan",
  "napoli"
];

/* =========================
   Arabic Translation
========================= */

const TEAM_AR = {
  "Al-Hilal": "الهلال",
  "Al Hilal": "الهلال",
  "Al-Hilal Riyadh": "الهلال",

  "Al-Nassr": "النصر",
  "Al Nassr": "النصر",
  "Al-Nassr Riyadh": "النصر",

  "Al-Ittihad": "الاتحاد",
  "Al Ittihad": "الاتحاد",

  "Al-Ahli": "الأهلي",
  "Al Ahli": "الأهلي",

  "Al-Shabab": "الشباب",
  "Al Shabab": "الشباب",

  "Al-Ettifaq": "الاتفاق",
  "Al Ettifaq": "الاتفاق",

  "Al-Taawoun": "التعاون",
  "Al Taawoun": "التعاون",

  "Al-Fateh": "الفتح",
  "Al Fateh": "الفتح",

  "Al-Raed": "الرائد",
  "Al Raed": "الرائد",

  "Al-Wehda": "الوحدة",
  "Al Wehda": "الوحدة",

  "Al-Khaleej": "الخليج",
  "Al Khaleej": "الخليج",

  "Al-Okhdood": "الأخدود",
  "Al Okhdood": "الأخدود",

  "Al-Qadsiah": "القادسية",
  "Al Qadsiah": "القادسية",

  "Real Madrid": "ريال مدريد",
  "Barcelona": "برشلونة",
  "Atletico Madrid": "أتلتيكو مدريد",

  "Manchester City": "مانشستر سيتي",
  "Manchester United": "مانشستر يونايتد",

  "Liverpool": "ليفربول",
  "Arsenal": "أرسنال",
  "Chelsea": "تشيلسي",
  "Tottenham Hotspur": "توتنهام",

  "Bayern Munich": "بايرن ميونخ",
  "Borussia Dortmund": "بوروسيا دورتموند",

  "Paris Saint-Germain": "باريس سان جيرمان",
  "PSG": "باريس سان جيرمان",

  "Juventus": "يوفنتوس",
  "Inter Milan": "إنتر ميلان",
  "AC Milan": "ميلان",
  "Napoli": "نابولي",
  "Roma": "روما"
};

const LEAGUE_AR = {
  "UEFA Champions League": "دوري أبطال أوروبا",
  "UEFA Europa League": "الدوري الأوروبي",
  "UEFA Europa Conference League": "دوري المؤتمر الأوروبي",

  "English Premier League": "الدوري الإنجليزي الممتاز",
  "Premier League": "الدوري الإنجليزي الممتاز",

  "La Liga": "الدوري الإسباني",
  "Serie A": "الدوري الإيطالي",
  "Bundesliga": "الدوري الألماني",
  "Ligue 1": "الدوري الفرنسي",

  "Saudi Professional League": "الدوري السعودي للمحترفين",
  "Saudi-Arabian Pro League": "الدوري السعودي للمحترفين",
  "Saudi Pro League": "الدوري السعودي للمحترفين",

  "Moroccan Botola": "الدوري المغربي",
  "Botola Pro": "الدوري المغربي للمحترفين",

  "Egyptian Premier League": "الدوري المصري الممتاز",
  "Qatar Stars League": "الدوري القطري",
  "UAE Pro League": "الدوري الإماراتي للمحترفين",

  "Iraq Stars League": "دوري نجوم العراق",
  "Kuwait Premier League": "الدوري الكويتي الممتاز",
  "Tunisian Ligue 1": "الدوري التونسي",
  "Algeria Ligue 1": "الدوري الجزائري",

  "AFC Champions League Elite": "دوري أبطال آسيا للنخبة",
  "AFC Champions League": "دوري أبطال آسيا",
  "CAF Champions League": "دوري أبطال أفريقيا",

  "FIFA World Cup": "كأس العالم",
  "World Cup": "كأس العالم",

  "AFC Asian Cup": "كأس آسيا",
  "Asian Cup": "كأس آسيا",

  "Africa Cup of Nations": "كأس أمم أفريقيا"
};

function translateTeam(name) {
  const value = String(name || "").trim();

  return TEAM_AR[value] || value || "فريق غير معروف";
}

function translateLeague(name) {
  const value = String(name || "").trim();

  return LEAGUE_AR[value] || value || "بطولة أخرى";
}

/* =========================
   Match Status
========================= */

function statusOf(event) {
  const status = String(event?.strStatus || "")
    .trim()
    .toUpperCase();

  const progress = String(event?.strProgress || "")
    .trim()
    .toUpperCase();

  if (
    ["LIVE", "1H", "2H", "ET", "P"].includes(status)
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
    ["FT", "FINAL", "AET", "PEN"].includes(status) ||
    progress === "FINAL"
  ) {
    return "FT";
  }

  return "NS";
}

/* =========================
   Match Priority
========================= */

function priorityOf(event) {
  const league = String(event?.strLeague || "");

  const leagueBase =
    LEAGUE_PRIORITY[league] ?? 30;

  const home =
    String(event?.strHomeTeam || "").toLowerCase();

  const away =
    String(event?.strAwayTeam || "").toLowerCase();

  let score = leagueBase;

  for (const team of TEAM_PRIORITY) {
    if (home.includes(team)) {
      score += 8;
    }

    if (away.includes(team)) {
      score += 8;
    }
  }

  const status = statusOf(event);

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

/* =========================
   Normalize Match
========================= */

function normalizeEvent(event, source = "TheSportsDB") {
  const date =
    event?.dateEvent ||
    event?.strEventDate ||
    "";

  const time =
    event?.strEventTime ||
    event?.strTime ||
    "00:00:00";

  const status = statusOf(event);

  return {
    fixture: {
      id:
        event?.idEvent ||
        event?.idLiveScore ||
        `${event?.idHomeTeam || ""}-${event?.idAwayTeam || ""}-${date}`,

      date: `${date}T${time}`,

      status: {
        short: status,
        elapsed: event?.strProgress || ""
      }
    },

    league: {
      id: String(event?.idLeague || ""),

      name: translateLeague(
        event?.strLeague
      ),

      originalName:
        event?.strLeague || "",

      country:
        event?.strCountry || ""
    },

    teams: {
      home: {
        name: translateTeam(
          event?.strHomeTeam
        ),

        originalName:
          event?.strHomeTeam || "",

        logo:
          event?.strHomeTeamBadge || ""
      },

      away: {
        name: translateTeam(
          event?.strAwayTeam
        ),

        originalName:
          event?.strAwayTeam || "",

        logo:
          event?.strAwayTeamBadge || ""
      }
    },

    goals: {
      home:
        event?.intHomeScore ?? null,

      away:
        event?.intAwayScore ?? null
    },

    media: {
      channel:
        event?.strTVStation || "",

      commentator:
        event?.strCommentator || ""
    },

    venue:
      event?.strVenue || "",

    city:
      event?.strCity || "",

    priority:
      priorityOf(event),

    source
  };
}

/* =========================
   TheSportsDB Events Day
========================= */

async function fetchEventsDay(date) {
  if (!API_KEY) {
    throw new Error(
      "THESPORTSDB_API_KEY غير موجود"
    );
  }

  const url =
    `https://www.thesportsdb.com/api/v1/json/${API_KEY}/eventsday.php` +
    `?d=${encodeURIComponent(date)}&s=Soccer`;

  try {
    const response =
      await api.get(url);

    return Array.isArray(
      response.data?.events
    )
      ? response.data.events
      : [];

  } catch (error) {
    console.error(
      "eventsday:",
      error.response?.status ||
      error.message
    );

    return [];
  }
}

/* =========================
   TheSportsDB V2 Livescore
========================= */

async function fetchLiveScores() {
  if (!API_KEY) {
    return [];
  }

  const url =
    "https://www.thesportsdb.com/api/v2/json/livescore/soccer";

  try {
    const response =
      await api.get(url, {
        headers: {
          "X-API-KEY": API_KEY,
          "Content-Type": "application/json"
        }
      });

    const data =
      response.data;

    if (Array.isArray(data)) {
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
      "V2 Livescore:",
      error.response?.status ||
      error.message
    );

    return [];
  }
}

/* =========================
   Merge Events
========================= */

function mergeEvents(arrays) {
  const map = new Map();

  for (const events of arrays) {
    for (const event of events) {
      if (!event) continue;

      const id =
        event.idEvent ||
        event.idLiveScore ||
        `${event.idHomeTeam}-${event.idAwayTeam}-${event.dateEvent}`;

      if (!id) continue;

      const existing =
        map.get(id);

      if (!existing) {
        map.set(id, event);
        continue;
      }

      const incomingStatus =
        statusOf(event);

      if (
        incomingStatus === "LIVE" ||
        incomingStatus === "HT"
      ) {
        map.set(id, event);
      }
    }
  }

  return [...map.values()];
}

/* =========================
   Sort Matches
========================= */

function sortMatches(matches) {
  return matches.sort((a, b) => {

    const liveA =
      ["LIVE", "HT"].includes(
        a.fixture.status.short
      )
        ? 1
        : 0;

    const liveB =
      ["LIVE", "HT"].includes(
        b.fixture.status.short
      )
        ? 1
        : 0;

    if (liveA !== liveB) {
      return liveB - liveA;
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
      new Date(a.fixture.date) -
      new Date(b.fixture.date)
    );
  });
}

/* =========================
   Get Matches
========================= */

async function getMatches(date) {
  const key =
    `matches:${date}`;

  const cached =
    cache.get(key);

  if (
    cached &&
    Date.now() <
      cached.expiresAt
  ) {
    return {
      data: cached.data,
      cached: true
    };
  }

  const dayEvents =
    await fetchEventsDay(date);

  const today =
    new Date()
      .toISOString()
      .slice(0, 10);

  const liveEvents =
    date === today
      ? await fetchLiveScores()
      : [];

  const raw =
    mergeEvents([
      dayEvents,
      liveEvents
    ]);

  let matches =
    raw.map(event =>
      normalizeEvent(
        event,
        "TheSportsDB"
      )
    );

  matches =
    [
      ...new Map(
        matches.map(match => [
          match.fixture.id,
          match
        ])
      ).values()
    ];

  sortMatches(matches);

  cache.set(key, {
    data: matches,
    expiresAt:
      Date.now() +
      CACHE_TIME
  });

  return {
    data: matches,
    cached: false
  };
}

/* =========================
   API Matches
========================= */

app.get(
  "/api/matches",
  async (req, res) => {

    const requestedDate =
      req.query.date ||
      new Date()
        .toISOString()
        .slice(0, 10);

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        requestedDate
      )
    ) {
      return res.status(400).json({
        source: "Validation",
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
          date: requestedDate,
          matches: result.data
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
        "/api/matches:",
        error
      );

      return res.status(500).json({
        source: "Server Error",
        data: [],
        count: 0,
        error:
          error.message
      });
    }
  }
);

/* =========================
   Health
   للاختبار فقط
========================= */

app.get(
  "/api/health",
  (req, res) => {

    res.json({
      status: "ok",
      server: "Live Modarraj",

      apiKey:
        API_KEY
          ? "موجود"
          : "غير موجود",

      database:
        "disabled - memory cache only",

      timestamp:
        new Date().toISOString()
    });
  }
);

/* =========================
   Live Test
========================= */

app.get(
  "/api/test/live",
  async (req, res) => {

    try {

      const live =
        await fetchLiveScores();

      res.json({
        status: "success",

        source:
          "TheSportsDB V2 Livescore",

        matches:
          live.length,

        data:
          live,

        timestamp:
          new Date().toISOString()
      });

    } catch (error) {

      res.status(502).json({
        status: "error",
        error:
          error.message
      });
    }
  }
);

/* =========================
   Frontend
========================= */

app.get(
  "/",
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        "index.html"
      )
    );
  }
);

/* =========================
   Favicon
========================= */

app.get(
  "/favicon.ico",
  (req, res) => {
    res.status(204).end();
  }
);

/* =========================
   404
========================= */

app.use(
  (req, res) => {

    res.status(404).json({
      error:
        "الرابط المطلوب غير موجود",

      path:
        req.path,

      method:
        req.method
    });
  }
);

/* =========================
   Socket.IO
========================= */

io.on(
  "connection",
  socket => {

    console.log(
      `Socket connected: ${socket.id}`
    );

    socket.on(
      "disconnect",
      () => {

        console.log(
          `Socket disconnected: ${socket.id}`
        );
      }
    );
  }
);

/* =========================
   Start
========================= */

server.listen(
  PORT,
  () => {

    console.log(
      `Live Modarraj running on port ${PORT}`
    );

    console.log(
      `TheSportsDB API key: ${
        API_KEY
          ? "present"
          : "missing"
      }`
    );

    console.log(
      "Database: disabled - memory cache only"
    );
  }
);
