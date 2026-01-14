import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  createClub,
  listClubs,
  searchClubs,
  getClubById,
  updateClub,
  deleteClub,
  joinClub,
  leaveClub,
  listMyClubs,
  listClubRequests,
  approveClubMember,
  rejectClubMember,
  removeClubMember,
  createClubSession,
  listClubSessions,
  updateClubSession,
  cancelClubSession,
  getClubLeague,
} from "../controllers/clubs.controller.js";

const router = Router();

router.post("/clubs", requireAuth, createClub);
router.get("/clubs", requireAuth, listClubs);
router.get("/clubs/search", requireAuth, searchClubs);
router.get("/clubs/:clubId", requireAuth, getClubById);
router.put("/clubs/:clubId", requireAuth, updateClub);
router.delete("/clubs/:clubId", requireAuth, deleteClub);

router.post("/clubs/:clubId/join", requireAuth, joinClub);
router.post("/clubs/:clubId/leave", requireAuth, leaveClub);
router.get("/me/clubs", requireAuth, listMyClubs);
router.get("/clubs/:clubId/requests", requireAuth, listClubRequests);
router.post("/clubs/:clubId/members/:userId/approve", requireAuth, approveClubMember);
router.post("/clubs/:clubId/members/:userId/reject", requireAuth, rejectClubMember);
router.post("/clubs/:clubId/members/:userId/remove", requireAuth, removeClubMember);

router.post("/clubs/:clubId/sessions", requireAuth, createClubSession);
router.get("/clubs/:clubId/sessions", requireAuth, listClubSessions);
router.put("/clubs/:clubId/sessions/:sessionId", requireAuth, updateClubSession);
router.post("/clubs/:clubId/sessions/:sessionId/cancel", requireAuth, cancelClubSession);
router.get("/clubs/:clubId/league", requireAuth, getClubLeague);

export default router;
