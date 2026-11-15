export type MobileRouteName =
  | 'planner'
  | 'tasks'
  | 'tasksBatch'
  | 'task'
  | 'taskPhotos'
  | 'review'
  | 'routines'
  | 'applyRoutines'
  | 'routine'
  | 'week'
  | 'weekReview'
  | 'dayPreferences'
  | 'focus'
  | 'focusItem'
  | 'photo'
  | 'photoImage'
  | 'partner'
  | 'partnerInvite'
  | 'partnerAccept'
  | 'partnerProfile'
  | 'partnerDay'
  | 'goals'
  | 'goal'
  | 'works'
  | 'work'
  | 'workNotes'
  | 'workSummary'
  | 'note'
  | 'catalog'
  | 'catalogDiscover'
  | 'catalogImport'
  | 'reading'
  | 'readingPreferences'
  | 'readingItem'
  | 'resources'
  | 'resourcesPreview'
  | 'resource'
  | 'resourceBookmarks'
  | 'resourceBookmark'
  | 'memos'
  | 'memo'
  | 'memoConvert'
  | 'search'
  | 'revisit'
  | 'revisitItem'
  | 'account'
  | 'accountPassword'
  | 'accountDelete'
  | 'exportData'
  | 'archives'
  | 'archivesSnapshot'
  | 'archiveItem';

export type MobileRoute = {
  name: MobileRouteName;
  id?: string;
  bookmarkId?: string;
  methods: readonly string[];
};

type RouteSpec = {
  name: MobileRouteName;
  pattern: readonly string[];
  methods: readonly string[];
};

const UUID_PATTERN = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

const MOBILE_ROUTES: readonly RouteSpec[] = [
  // Planner & day flow
  { name: 'planner', pattern: ['planner'], methods: ['GET'] },
  { name: 'tasks', pattern: ['planner', 'tasks'], methods: ['POST'] },
  { name: 'tasksBatch', pattern: ['planner', 'tasks', 'batch'], methods: ['POST'] },
  { name: 'task', pattern: ['planner', 'tasks', ':id'], methods: ['PATCH', 'DELETE'] },
  { name: 'taskPhotos', pattern: ['planner', 'tasks', ':id', 'photos'], methods: ['GET', 'POST'] },
  { name: 'review', pattern: ['planner', 'review'], methods: ['GET', 'PUT'] },
  { name: 'routines', pattern: ['planner', 'routines'], methods: ['GET', 'POST'] },
  { name: 'applyRoutines', pattern: ['planner', 'routines', 'apply'], methods: ['POST'] },
  { name: 'routine', pattern: ['planner', 'routines', ':id'], methods: ['PATCH', 'DELETE'] },
  { name: 'week', pattern: ['planner', 'week'], methods: ['GET'] },
  { name: 'weekReview', pattern: ['planner', 'week-review'], methods: ['GET', 'PUT'] },
  { name: 'dayPreferences', pattern: ['planner', 'day-preferences'], methods: ['PUT'] },

  // Focus & photos
  { name: 'focus', pattern: ['focus'], methods: ['GET', 'POST'] },
  { name: 'focusItem', pattern: ['focus', ':id'], methods: ['PATCH'] },
  { name: 'photo', pattern: ['photos', ':id'], methods: ['DELETE'] },
  { name: 'photoImage', pattern: ['photos', ':id', 'image'], methods: ['GET'] },

  // Partner
  { name: 'partner', pattern: ['partner'], methods: ['GET', 'DELETE'] },
  { name: 'partnerInvite', pattern: ['partner', 'invite'], methods: ['GET', 'POST', 'DELETE'] },
  { name: 'partnerAccept', pattern: ['partner', 'accept'], methods: ['POST'] },
  { name: 'partnerProfile', pattern: ['partner', 'profile'], methods: ['POST'] },
  { name: 'partnerDay', pattern: ['partner', 'day'], methods: ['GET'] },

  // Goals
  { name: 'goals', pattern: ['goals'], methods: ['GET', 'POST'] },
  { name: 'goal', pattern: ['goals', ':id'], methods: ['PATCH', 'DELETE'] },

  // Library & catalog
  { name: 'works', pattern: ['works'], methods: ['GET', 'POST'] },
  { name: 'work', pattern: ['works', ':id'], methods: ['GET', 'PATCH', 'DELETE'] },
  { name: 'workNotes', pattern: ['works', ':id', 'notes'], methods: ['POST'] },
  { name: 'workSummary', pattern: ['works', ':id', 'summary'], methods: ['PATCH'] },
  { name: 'note', pattern: ['notes', ':id'], methods: ['PATCH', 'DELETE'] },
  { name: 'catalog', pattern: ['catalog'], methods: ['GET'] },
  { name: 'catalogDiscover', pattern: ['catalog', 'discover'], methods: ['GET'] },
  { name: 'catalogImport', pattern: ['catalog', 'import'], methods: ['POST'] },

  // Reading
  { name: 'reading', pattern: ['reading'], methods: ['GET', 'POST'] },
  { name: 'readingPreferences', pattern: ['reading', 'preferences'], methods: ['PATCH'] },
  { name: 'readingItem', pattern: ['reading', ':id'], methods: ['PATCH'] },

  // Learning resources
  { name: 'resources', pattern: ['resources'], methods: ['GET', 'POST'] },
  { name: 'resourcesPreview', pattern: ['resources', 'preview'], methods: ['POST'] },
  { name: 'resource', pattern: ['resources', ':id'], methods: ['GET', 'PATCH', 'DELETE'] },
  { name: 'resourceBookmarks', pattern: ['resources', ':id', 'bookmarks'], methods: ['POST'] },
  { name: 'resourceBookmark', pattern: ['resources', ':id', 'bookmarks', ':bookmarkId'], methods: ['DELETE'] },

  // Memory, search & revisit
  { name: 'memos', pattern: ['memos'], methods: ['GET', 'POST'] },
  { name: 'memo', pattern: ['memos', ':id'], methods: ['PATCH', 'DELETE'] },
  { name: 'memoConvert', pattern: ['memos', ':id', 'convert'], methods: ['POST'] },
  { name: 'search', pattern: ['search'], methods: ['GET'] },
  { name: 'revisit', pattern: ['revisit'], methods: ['GET', 'POST'] },
  { name: 'revisitItem', pattern: ['revisit', ':id'], methods: ['DELETE'] },

  // Account, export & encrypted archives
  { name: 'account', pattern: ['account'], methods: ['GET'] },
  { name: 'accountPassword', pattern: ['account', 'password'], methods: ['POST'] },
  { name: 'accountDelete', pattern: ['account', 'delete'], methods: ['POST'] },
  { name: 'exportData', pattern: ['export'], methods: ['GET'] },
  { name: 'archives', pattern: ['archives'], methods: ['GET', 'POST'] },
  { name: 'archivesSnapshot', pattern: ['archives', 'snapshot'], methods: ['POST'] },
  { name: 'archiveItem', pattern: ['archives', ':id'], methods: ['GET', 'POST'] },
];

export function resolveMobileRoute(path: readonly string[]): MobileRoute | null {
  for (const spec of MOBILE_ROUTES) {
    if (spec.pattern.length !== path.length) continue;
    let id: string | undefined;
    let bookmarkId: string | undefined;
    let matched = true;
    for (let i = 0; i < spec.pattern.length; i++) {
      const expected = spec.pattern[i], actual = path[i];
      if (expected === ':id') {
        if (!UUID_PATTERN.test(actual)) { matched = false; break; }
        id = actual;
      } else if (expected === ':bookmarkId') {
        if (!UUID_PATTERN.test(actual)) { matched = false; break; }
        bookmarkId = actual;
      } else if (expected !== actual) {
        matched = false; break;
      }
    }
    if (matched) return { name: spec.name, methods: spec.methods, ...(id ? { id } : {}), ...(bookmarkId ? { bookmarkId } : {}) };
  }
  return null;
}
