import { Router, type IRouter } from "express";
import runRouter from "./run.js";
import keysRouter from "./keys.js";
import reviewsRouter from "./reviews.js";

const router: IRouter = Router();

router.use("/gate", runRouter);
router.use("/gate/keys", keysRouter);
router.use("/gate/reviews", reviewsRouter);

export default router;
