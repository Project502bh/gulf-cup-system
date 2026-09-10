export const state = {
  user: null,
};

const WRITE_ROLES = ['admin', 'tournament_manager', 'data_entry'];
const DELETE_ROLES = ['admin', 'tournament_manager'];
const GENERATE_ROLES = ['admin', 'tournament_manager'];
const APPROVE_ROLES = ['admin', 'tournament_manager', 'results_reviewer'];

export function can(action) {
  const role = state.user && state.user.role;
  if (!role) return false;
  if (role === 'admin') return true;
  switch (action) {
    case 'write': return WRITE_ROLES.includes(role);
    case 'delete': return DELETE_ROLES.includes(role);
    case 'generate': return GENERATE_ROLES.includes(role);
    case 'approve': return APPROVE_ROLES.includes(role);
    case 'manageUsers': return false;
    default: return false;
  }
}
