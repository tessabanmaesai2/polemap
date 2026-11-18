const express = require('express');
const { getThaiNow } = require('../utils/core.cjs');
const { authenticate, requireSuperAdmin, handleLogin, handleVerify } = require('../auth/auth.cjs');
const {
  handleGetUsers,
  handleCreateOrSaveUser,
  handleUpdateUserById,
  handleUpdatePasswordById,
  handleDeleteUser
} = require('../users/userService.cjs');
const {
  handleGetSecurityLogs,
  handleClearSecurityLogs,
  handleUnbanIp
} = require('../security/radar.cjs');
const {
  handleGetPoles,
  handleGetSinglePole,
  handleCreatePole,
  handleUpdatePole,
  handleDeletePole,
  handleSummary
} = require('../poles/poleService.cjs');

function createApiRouter() {
  const router = express.Router();

  // Authentication
  router.post('/auth/login', handleLogin);
  router.get('/auth/verify', authenticate, handleVerify);

  // Superadmin & Users Management (DEC-027: Superadmin / Master Key ONLY)
  router.get('/superadmin/users', authenticate, requireSuperAdmin, handleGetUsers);
  router.post('/superadmin/users', authenticate, requireSuperAdmin, handleCreateOrSaveUser);
  router.put('/superadmin/users/:id', authenticate, requireSuperAdmin, handleUpdateUserById);
  router.put('/superadmin/users/:id/password', authenticate, requireSuperAdmin, handleUpdatePasswordById);
  router.delete('/superadmin/users/:id', authenticate, requireSuperAdmin, handleDeleteUser);

  router.get('/users', authenticate, requireSuperAdmin, handleGetUsers);
  router.post('/users', authenticate, requireSuperAdmin, handleCreateOrSaveUser);
  router.put('/users/:id', authenticate, requireSuperAdmin, handleUpdateUserById);
  router.put('/users/:id/password', authenticate, requireSuperAdmin, handleUpdatePasswordById);
  router.delete('/users/:username', authenticate, requireSuperAdmin, handleDeleteUser);

  // Security Radar (DEC-026 & DEC-027: Superadmin ONLY)
  router.get('/security/logs', authenticate, requireSuperAdmin, handleGetSecurityLogs);
  router.delete('/security/logs', authenticate, requireSuperAdmin, handleClearSecurityLogs);
  router.post('/security/unban-ip', authenticate, requireSuperAdmin, handleUnbanIp);

  // Poles (Read: Public, Mutations: Authenticated Staff/Admin)
  router.get('/poles', handleGetPoles);
  router.get('/speakers', handleGetPoles);
  router.get('/poles/:id', handleGetSinglePole);
  router.post('/poles', authenticate, handleCreatePole);
  router.put('/poles/:id', authenticate, handleUpdatePole);
  router.delete('/poles/:id', authenticate, handleDeletePole);

  router.get('/reports/summary', handleSummary);
  router.get('/health', (req, res) => res.json({ status: 'ok', service: 'POLE MAP', time: getThaiNow() }));

  return router;
}

module.exports = { createApiRouter };
