import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  acceptConnectionRequest,
  cancelConnectionRequest,
  listConnections,
  listIncomingRequests,
  listOutgoingRequests,
  sendConnectionRequest,
} from "../controllers/connections.controller.js";

const router = Router();

router.post("/request", requireAuth, sendConnectionRequest);
router.post("/request/cancel", requireAuth, cancelConnectionRequest);
router.post("/request/accept", requireAuth, acceptConnectionRequest);
router.get("/requests/incoming", requireAuth, listIncomingRequests);
router.get("/requests/outgoing", requireAuth, listOutgoingRequests);
router.get("/", requireAuth, listConnections);

export default router;

