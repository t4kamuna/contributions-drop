// GitHub GraphQL API から草（contribution calendar）を取る。

import type { Calendar, Day, Level } from "./cells.js";

const QUERY = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        weeks { contributionDays { date contributionCount contributionLevel } }
      }
    }
  }
}`;

const LEVELS: Record<string, Level> = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

interface Response {
  data?: {
    user: {
      contributionsCollection: {
        contributionCalendar: {
          weeks: { contributionDays: { date: string; contributionCount: number; contributionLevel: string }[] }[];
        };
      };
    } | null;
  };
  errors?: { message: string }[];
}

export async function fetchCalendar(login: string, token: string): Promise<Calendar> {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "contributions-drop",
    },
    body: JSON.stringify({ query: QUERY, variables: { login } }),
  });
  if (!res.ok) throw new Error(`GitHub API responded ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as Response;
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
  const user = json.data?.user;
  if (!user) throw new Error(`user not found: ${login}`);

  const weeks = user.contributionsCollection.contributionCalendar.weeks;
  const days: Day[] = weeks.flatMap((w) =>
    w.contributionDays.map((d) => ({
      date: d.date,
      count: d.contributionCount,
      level: LEVELS[d.contributionLevel] ?? 0,
    })),
  );
  return { weeks: weeks.length, days };
}
