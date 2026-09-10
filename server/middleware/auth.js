const ROLE_LABELS = {
  admin: 'مدير النظام',
  tournament_manager: 'مدير بطولة',
  data_entry: 'مدخل بيانات',
  results_reviewer: 'مراجع نتائج',
  viewer: 'مشاهد أو محلل',
};

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'غير مصادق', code: 'UNAUTHENTICATED' });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'غير مصادق', code: 'UNAUTHENTICATED' });
    }
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).json({ error: 'لا تملك صلاحية تنفيذ هذا الإجراء', code: 'FORBIDDEN' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, ROLE_LABELS };
