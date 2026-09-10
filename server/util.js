function paginationParams(query, defaultLimit = 20, maxLimit = 100) {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;
  return { page, limit, offset: (page - 1) * limit };
}

function handleDbError(err, res) {
  const msg = String(err && err.message || err);
  if (msg.includes('FOREIGN KEY constraint failed') || msg.includes('SQLITE_CONSTRAINT_FOREIGNKEY')) {
    return res.status(409).json({ error: 'لا يمكن تنفيذ العملية لوجود سجلات مرتبطة بهذا العنصر', code: 'REFERENCED' });
  }
  if (msg.includes('UNIQUE constraint failed')) {
    return res.status(409).json({ error: 'السجل موجود مسبقًا', code: 'DUPLICATE' });
  }
  if (msg.includes('CHECK constraint failed')) {
    return res.status(400).json({ error: 'بيانات غير صالحة', code: 'INVALID' });
  }
  console.error(err);
  return res.status(500).json({ error: 'حدث خطأ داخلي غير متوقع', code: 'INTERNAL' });
}

function withTransaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) { /* ignore */ }
    throw err;
  }
}

module.exports = { paginationParams, handleDbError, withTransaction };
