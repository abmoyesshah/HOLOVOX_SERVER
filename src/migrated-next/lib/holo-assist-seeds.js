function daysAgo(days, hours = 9, minutes = 0) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

export function getSeedSessions(userId) {
  return [
    {
      id: "seed-session-1",
      user_id: userId,
      session_date: daysAgo(0, 10, 30).toISOString(),
      topic: "Discovery Call — Acme Corp",
      duration_mins: 42,
      cards_used_pct: 86,
      recoveries: 2,
      strongest: "Question-led discovery",
      work_on: "Slow down after any specific questions",
      seeded: true,
    },
    {
      id: "seed-session-2",
      user_id: userId,
      session_date: daysAgo(1, 16, 0).toISOString(),
      topic: "1:1 Coaching — Priya",
      duration_mins: 28,
      cards_used_pct: 91,
      recoveries: 1,
      strongest: "Clear reinforcement",
      work_on: "Leave more silence after prompts",
      seeded: true,
    },
    {
      id: "seed-session-3",
      user_id: userId,
      session_date: daysAgo(4, 11, 15).toISOString(),
      topic: "Demo — Northwind",
      duration_mins: 55,
      cards_used_pct: 78,
      recoveries: 3,
      strongest: "Outcome framing",
      work_on: "Tighten technical transitions",
      seeded: true,
    },
  ];
}

export function getSeedPlaybooks(userId) {
  return [
    {
      id: "seed-playbook-1",
      user_id: userId,
      title: "Discovered in meeting",
      description: "Meeting and calls discovery, urgency, and decision path",
      usage_count: 7,
      is_private: false,
      seeded: true,
    },
    {
      id: "seed-playbook-2",
      user_id: userId,
      title: "Objection Recovery",
      description: "Timing, pricing, and implementation pushback",
      usage_count: 9,
      is_private: false,
      seeded: true,
    },
    {
      id: "seed-playbook-3",
      user_id: userId,
      title: "Technical Deep Dive",
      description: "Keep advanced demos structured and concise",
      usage_count: 6,
      is_private: false,
      seeded: true,
    },
  ];
}

export function getSeedSkills(userId) {
  return [
    { id: "seed-skill-1", user_id: userId, trait_name: "Discovery", current_score: 0.82, previous_score: 0.66, seeded: true },
    { id: "seed-skill-2", user_id: userId, trait_name: "Listening", current_score: 0.74, previous_score: 0.61, seeded: true },
    { id: "seed-skill-3", user_id: userId, trait_name: "Objections", current_score: 0.71, previous_score: 0.54, seeded: true },
    { id: "seed-skill-4", user_id: userId, trait_name: "Closing", current_score: 0.77, previous_score: 0.59, seeded: true },
    { id: "seed-skill-5", user_id: userId, trait_name: "Demo", current_score: 0.69, previous_score: 0.5, seeded: true },
    { id: "seed-skill-6", user_id: userId, trait_name: "Follow-up", current_score: 0.8, previous_score: 0.65, seeded: true },
  ];
}

export function getSeedJournal(userId) {
  return [
    {
      id: "seed-journal-1",
      user_id: userId,
      entry_date: daysAgo(1, 18, 0).toISOString(),
      topic: "Confidence shift",
      entry_text: "You stayed calm through pricing pressure and kept the call moving forward.",
      seeded: true,
    },
    {
      id: "seed-journal-2",
      user_id: userId,
      entry_date: daysAgo(3, 17, 0).toISOString(),
      topic: "Better questions",
      entry_text: "Your discovery questions pulled out timing and stakeholder pressure much earlier.",
      seeded: true,
    },
    {
      id: "seed-journal-3",
      user_id: userId,
      entry_date: daysAgo(6, 15, 30).toISOString(),
      topic: "Cleaner close",
      entry_text: "You landed the next step directly instead of over-explaining the wrap-up.",
      seeded: true,
    },
  ];
}

export function getSeedGoal() {
  return "Turn every discovery call into a concrete next step.";
}