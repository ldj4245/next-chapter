export type MobileRoute = {
  name: 'planner' | 'tasks' | 'task' | 'review' | 'applyRoutines' | 'goals' | 'goal' | 'account';
  id?: string;
  methods: readonly string[];
};

export function resolveMobileRoute(path: readonly string[]): MobileRoute | null {
  if (path.length === 1) {
    if (path[0] === 'planner') return { name: 'planner', methods: ['GET'] };
    if (path[0] === 'goals') return { name: 'goals', methods: ['GET', 'POST'] };
    if (path[0] === 'account') return { name: 'account', methods: ['GET'] };
  }
  if (path.length === 2) {
    if (path[0] === 'planner' && path[1] === 'tasks') return { name: 'tasks', methods: ['POST'] };
    if (path[0] === 'planner' && path[1] === 'review') return { name: 'review', methods: ['GET', 'PUT'] };
    if (path[0] === 'goals' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(path[1])) {
      return { name: 'goal', id: path[1], methods: ['PATCH', 'DELETE'] };
    }
  }
  if (path.length === 3 && path[0] === 'planner' && path[1] === 'tasks' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(path[2])) {
    return { name: 'task', id: path[2], methods: ['PATCH', 'DELETE'] };
  }
  if (path.length === 3 && path[0] === 'planner' && path[1] === 'routines' && path[2] === 'apply') {
    return { name: 'applyRoutines', methods: ['POST'] };
  }
  return null;
}
