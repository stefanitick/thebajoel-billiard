// ============================================================
// THE BAJOEL BILLIARD — Supabase API Layer
// ============================================================
var DB = (function() {

  function headers() {
    return {
      'apikey': SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    };
  }

  async function q(table, params) {
    // params: {select, filters, order, limit}
    var url = SUPA_URL + '/rest/v1/' + table;
    var qs = [];
    if (params.select) qs.push('select=' + params.select);
    if (params.filters) params.filters.forEach(function(f) { qs.push(f); });
    if (params.order)  qs.push('order=' + params.order);
    if (params.limit)  qs.push('limit=' + params.limit);
    if (qs.length) url += '?' + qs.join('&');
    var res = await fetch(url, { headers: headers() });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function insert(table, data) {
    var url = SUPA_URL + '/rest/v1/' + table;
    var res = await fetch(url, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    var rows = await res.json();
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async function update(table, id, data) {
    var url = SUPA_URL + '/rest/v1/' + table + '?id=eq.' + id;
    var res = await fetch(url, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    var rows = await res.json();
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async function rpc(fn, args) {
    var url = SUPA_URL + '/rest/v1/rpc/' + fn;
    var res = await fetch(url, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(args || {}),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  // ── PLAYERS ────────────────────────────────────────────────
  function getPlayers() {
    return q('players', { select: '*', order: 'level.desc' });
  }

  function addPlayer(name, level) {
    var lv = levelLabel(level || 50);
    return insert('players', { name: name, level: level || 50, level_label: lv });
  }

  function updatePlayerLevel(id, level) {
    var lv = levelLabel(level);
    return update('players', id, { level: level, level_label: lv });
  }

  // ── SESSIONS ───────────────────────────────────────────────
  function getSessions() {
    return q('sessions', { select: '*', order: 'created_at.desc' });
  }

  function createSession(data) {
    return insert('sessions', { name: data.name, date: data.date, venue: data.venue, status: 'active' });
  }

  function closeSession(id) {
    return update('sessions', id, { status: 'closed' });
  }

  // ── RALLIES ────────────────────────────────────────────────
  function getRallies(sessionId) {
    return q('rallies', { select: '*', filters: ['session_id=eq.' + sessionId], order: 'created_at.asc' });
  }

  function createRally(data) {
    return insert('rallies', {
      session_id: data.sessionId,
      name: data.name,
      type: data.type,
      has_groups: data.hasGroups || false,
      group_count: data.groupCount || 1,
      player_ids: data.playerIds,
      pairs: data.pairs || [],
      status: 'active',
    });
  }

  function closeRally(id) {
    return update('rallies', id, { status: 'closed' });
  }

  function updateRally(id, data) {
    return update('rallies', id, data);
  }

  function updateGroup(id, data) {
    return update('groups', id, data);
  }

  function getLastRallyPairs(sessionId) {
    // Get pairs from most recent double rally in last session before this one
    return q('rallies', {
      select: '*',
      filters: ['type=eq.double', 'status=eq.closed'],
      order: 'created_at.desc',
      limit: 1,
    });
  }

  // ── GROUPS ─────────────────────────────────────────────────
  function getGroups(sessionId) {
    return q('groups', { select: '*', filters: ['session_id=eq.' + sessionId], order: 'created_at.asc' });
  }

  function createGroup(data) {
    return insert('groups', {
      rally_id: data.rallyId,
      session_id: data.sessionId,
      name: data.name,
      player_ids: data.playerIds,
    });
  }

  // ── MATCHES ────────────────────────────────────────────────
  function getMatches(sessionId) {
    return q('matches', { select: '*', filters: ['session_id=eq.' + sessionId], order: 'created_at.asc' });
  }

  function createMatch(data) {
    return insert('matches', {
      rally_id: data.rallyId,
      session_id: data.sessionId,
      group_id: data.groupId || null,
      team_a: data.teamA,
      team_b: data.teamB,
      score_a: 0, score_b: 0,
      result: 'pending', status: 'pending',
    });
  }

  function submitMatch(id, scoreA, scoreB) {
    if (scoreA === scoreB) throw new Error('Score tied — cannot submit');
    var result = scoreA > scoreB ? 'team_a' : 'team_b';
    return update('matches', id, { score_a: scoreA, score_b: scoreB, result: result, status: 'done' });
  }

  function voidMatch(id) {
    return update('matches', id, { result: 'void', status: 'void' });
  }

  function reopenMatch(id) {
    return update('matches', id, { result: 'pending', status: 'pending', score_a: 0, score_b: 0 });
  }

  // ── BILL ENTRIES ───────────────────────────────────────────
  function getBillEntries(sessionId) {
    return q('bill_entries', { select: '*', filters: ['session_id=eq.' + sessionId], order: 'created_at.asc' });
  }

  function addBillEntry(sessionId, playerId, total, proofUrl) {
    return insert('bill_entries', { session_id: sessionId, player_id: playerId, total: total, proof_url: proofUrl || '' });
  }

  function deleteBillEntry(id) {
    var url = SUPA_URL + '/rest/v1/bill_entries?id=eq.' + id;
    return fetch(url, { method: 'DELETE', headers: headers() });
  }

  // ── DONATION ENTRIES ───────────────────────────────────────
  function getDonationEntries(sessionId) {
    return q('donation_entries', { select: '*', filters: ['session_id=eq.' + sessionId], order: 'created_at.asc' });
  }

  function addDonationEntry(sessionId, donorName, total) {
    return insert('donation_entries', { session_id: sessionId, donor_name: donorName, total: total });
  }

  function deleteDonationEntry(id) {
    var url = SUPA_URL + '/rest/v1/donation_entries?id=eq.' + id;
    return fetch(url, { method: 'DELETE', headers: headers() });
  }

  // ── BILLS ──────────────────────────────────────────────────
  function getBill(sessionId) {
    return q('bills', { select: '*', filters: ['session_id=eq.' + sessionId], limit: 1 })
      .then(function(rows) { return rows[0] || null; });
  }

  async function closeBill(sessionId, bankAccount, totalBill, totalDonasi) {
    // Create bill record
    var bill = await insert('bills', {
      session_id: sessionId,
      bank_account: bankAccount,
      total_bill: totalBill,
      total_donasi: totalDonasi,
      status: 'closed',
      closed_at: new Date().toISOString(),
    });
    // Close session too
    await closeSession(sessionId);
    return bill;
  }

  // ── PLAYER PAYMENTS ────────────────────────────────────────
  function getPlayerPayments(sessionId) {
    return q('player_payments', { select: '*', filters: ['session_id=eq.' + sessionId], order: 'created_at.asc' });
  }

  function confirmPlayerPayment(data) {
    return insert('player_payments', {
      bill_id: data.billId,
      session_id: data.sessionId,
      player_id: data.playerId,
      amount: data.amount,
      rally_count: data.rallyCount,
      method: data.method,
      proof_url: data.proofUrl || '',
      status: 'paid',
    });
  }

  // ── STORAGE (proof images) ─────────────────────────────────
  async function uploadProof(file, sessionId) {
    var ext = file.name.split('.').pop();
    var path = sessionId + '/' + Date.now() + '.' + ext;
    var url = SUPA_URL + '/storage/v1/object/proofs/' + path;
    var res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': 'Bearer ' + SUPA_KEY,
        'Content-Type': file.type,
        'x-upsert': 'true',
      },
      body: file,
    });
    if (!res.ok) throw new Error('Upload failed');
    return SUPA_URL + '/storage/v1/object/public/proofs/' + path;
  }

  return {
    getPlayers, addPlayer, updatePlayerLevel,
    getSessions, createSession, closeSession,
    getRallies, createRally, closeRally, updateRally, getLastRallyPairs,
    getGroups, createGroup, updateGroup,
    getMatches, createMatch, submitMatch, voidMatch, reopenMatch,
    getBillEntries, addBillEntry, deleteBillEntry,
    getDonationEntries, addDonationEntry, deleteDonationEntry,
    getBill, closeBill,
    getPlayerPayments, confirmPlayerPayment,
    uploadProof,
  };
})();

// ── LEVEL HELPER ─────────────────────────────────────────────
function levelLabel(n) {
  var v = Math.min(100, Math.max(0, Number(n) || 50));
  if (v >= 81) return 'A';
  if (v >= 61) return 'B';
  if (v >= 41) return 'C';
  if (v >= 21) return 'D';
  return 'E';
}
function clampLevel(n) { return Math.min(100, Math.max(0, Math.round(Number(n) || 50))); }
