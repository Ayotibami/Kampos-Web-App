import { env } from "./env";

export interface CampusRow {
  campus_tag: string;
  campus_name: string;
}

export interface MajorRow {
  major_tag: string;
  major_name: string;
}

/**
 * Server-side initial fetch for /villagepeople/reference — unlike every
 * other admin list in this section, GET /misc/campuses and /misc/majors
 * are genuinely public, unauthenticated endpoints (the setup wizard's own
 * campus/major pickers already call them with no login at all), so this
 * doesn't need to forward the incoming request's cookies the way
 * serverUsers.ts/serverAudit.ts do. Empty array on any failure, same
 * "never crash the page over a transient backend blip" reasoning as
 * every other server-fetch here.
 */
export async function listCampusesAndMajors(): Promise<{ campuses: CampusRow[]; majors: MajorRow[] }> {
  try {
    const [campusesRes, majorsRes] = await Promise.all([
      fetch(`${env.API_BASE}/misc/campuses`, { cache: "no-store" }),
      fetch(`${env.API_BASE}/misc/majors`, { cache: "no-store" }),
    ]);
    const campusesJson = campusesRes.ok ? ((await campusesRes.json()) as { data?: CampusRow[] }) : {};
    const majorsJson = majorsRes.ok ? ((await majorsRes.json()) as { data?: MajorRow[] }) : {};
    return { campuses: campusesJson.data ?? [], majors: majorsJson.data ?? [] };
  } catch {
    return { campuses: [], majors: [] };
  }
}
