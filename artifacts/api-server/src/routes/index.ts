import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import gateRouter from "./gate/index.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(gateRouter);

export default router;
