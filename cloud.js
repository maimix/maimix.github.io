(function (global) {
  "use strict";

  const SUPABASE_URL = "https://spxdzedpietfhqaeapoo.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_H2abT1WIn4U9T_2bfbz0tQ_D772jK6B";

  const CURRENT_USER_KEY = "pomelo_current_user";
  const LEADERBOARD_KEY = "pomelo_leaderboard";
  const DECOR_KEY = "pomelo_decor_config";

  const DEFAULT_USER = "霜叶";
  const DEFAULT_DECOR = {
    bgSkin: "bamboo",
    bgLabel: "竹影清风",
    bladeSkin: "flame",
    bladeLabel: "烈焰斩魔"
  };

  const ACHIEVEMENTS_DEF = [
    { id: "first_slice", name: "初试锋芒", desc: "累计切开 1 个柚子", check: s => s.totalSliced >= 1 },
    { id: "combo_5", name: "连斩快手", desc: "单次挥刀达成 5 连斩", check: s => s.maxCombo >= 5 },
    { id: "combo_10", name: "疾风骤雨", desc: "单次挥刀达成 10 连斩", check: s => s.maxCombo >= 10 },
    { id: "juice_1000", name: "鲜榨果吧大师", desc: "累计榨出 1000 ml 果汁", check: s => s.totalJuice >= 1000 },
    { id: "score_500", name: "宗师之境", desc: "最高纪录达到 500 分", check: s => s.bestArcade >= 500 }
  ];

  let supabaseClient = null;

  function initSupabase() {
    if (supabaseClient) return supabaseClient;
    try {
      if (global.supabase && typeof global.supabase.createClient === "function") {
        supabaseClient = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      }
    } catch (err) {
      console.warn("Supabase 初始化失败，将使用本地缓存:", err);
    }
    return supabaseClient;
  }

  function getCurrentUser() {
    try {
      return localStorage.getItem(CURRENT_USER_KEY) || DEFAULT_USER;
    } catch (e) {
      return DEFAULT_USER;
    }
  }

  function setCurrentUser(username) {
    const clean = (username || "").trim() || DEFAULT_USER;
    try {
      localStorage.setItem(CURRENT_USER_KEY, clean);
    } catch (e) {}
    getUserData(clean);
    return clean;
  }

  function createEmptyUserData() {
    return {
      totalScore: 0,
      totalJuice: 0,
      totalSliced: 0,
      maxCombo: 0,
      bestArcade: 0,
      unlockedAch: []
    };
  }

  function getUserData(username = getCurrentUser()) {
    const key = `pomelo_user_${username}`;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        return { ...createEmptyUserData(), ...JSON.parse(raw) };
      }
      const init = createEmptyUserData();
      localStorage.setItem(key, JSON.stringify(init));
      return init;
    } catch (e) {
      return createEmptyUserData();
    }
  }

  function getLocalLeaderboard() {
    try {
      const list = JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function updateLocalLeaderboard(username, bestScore) {
    try {
      const lb = getLocalLeaderboard();
      const existing = lb.find(item => item.name === username);
      if (existing) {
        if (bestScore > existing.score) existing.score = bestScore;
      } else {
        lb.push({ name: username, score: bestScore });
      }
      lb.sort((a, b) => b.score - a.score);
      const trimmed = lb.slice(0, 20);
      localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(trimmed));
      return trimmed;
    } catch (e) {
      return [];
    }
  }

  async function syncScoreToCloud(username, bestScore) {
    const client = initSupabase();
    if (!client || !username) return false;
    try {
      const { data: existing } = await client
        .from("leaderboard")
        .select("score")
        .eq("name", username)
        .maybeSingle();

      if (existing) {
        if (bestScore > existing.score) {
          await client
            .from("leaderboard")
            .update({ score: bestScore, updated_at: new Date().toISOString() })
            .eq("name", username);
        }
      } else {
        await client
          .from("leaderboard")
          .insert([{ name: username, score: bestScore }]);
      }
      return true;
    } catch (err) {
      console.warn("同步分数到 Supabase 失败:", err);
      return false;
    }
  }

  async function saveUserData(data, username = getCurrentUser()) {
    const merged = { ...createEmptyUserData(), ...data };
    try {
      localStorage.setItem(`pomelo_user_${username}`, JSON.stringify(merged));
    } catch (e) {}
    updateLocalLeaderboard(username, merged.bestArcade);
    await syncScoreToCloud(username, merged.bestArcade);
    return merged;
  }

  async function fetchLeaderboard(limit = 10) {
    const localList = getLocalLeaderboard();
    const client = initSupabase();
    if (!client) return localList.slice(0, limit);

    try {
      const { data, error } = await client
        .from("leaderboard")
        .select("name, score")
        .order("score", { ascending: false })
        .limit(limit);

      if (error || !Array.isArray(data)) {
        return localList.slice(0, limit);
      }

      const map = new Map();
      localList.forEach(item => {
        if (item && item.name) map.set(item.name, Number(item.score) || 0);
      });
      data.forEach(item => {
        if (item && item.name) {
          const prev = map.get(item.name) || 0;
          map.set(item.name, Math.max(prev, Number(item.score) || 0));
        }
      });

      const merged = Array.from(map.entries())
        .map(([name, score]) => ({ name, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      try {
        localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(merged));
      } catch (e) {}

      return merged;
    } catch (err) {
      return localList.slice(0, limit);
    }
  }

  function evaluateNewAchievements(username = getCurrentUser()) {
    const uData = getUserData(username);
    const newlyUnlocked = [];
    ACHIEVEMENTS_DEF.forEach(ach => {
      if (!uData.unlockedAch.includes(ach.id) && ach.check(uData)) {
        uData.unlockedAch.push(ach.id);
        newlyUnlocked.push(ach);
      }
    });
    if (newlyUnlocked.length > 0) {
      try {
        localStorage.setItem(`pomelo_user_${username}`, JSON.stringify(uData));
      } catch (e) {}
    }
    return newlyUnlocked;
  }

  function getDecorConfig() {
    try {
      const raw = localStorage.getItem(DECOR_KEY);
      if (!raw) return { ...DEFAULT_DECOR };
      return { ...DEFAULT_DECOR, ...JSON.parse(raw) };
    } catch (e) {
      return { ...DEFAULT_DECOR };
    }
  }

  function saveDecorConfig(partialOrFull) {
    const next = { ...getDecorConfig(), ...(partialOrFull || {}) };
    try {
      localStorage.setItem(DECOR_KEY, JSON.stringify(next));
    } catch (e) {}
    return next;
  }

  initSupabase();

  global.PomeloCloud = {
    ACHIEVEMENTS_DEF,
    initSupabase,
    getCurrentUser,
    setCurrentUser,
    getUserData,
    saveUserData,
    fetchLeaderboard,
    getLocalLeaderboard,
    evaluateNewAchievements,
    getDecorConfig,
    saveDecorConfig
  };
})(window);
