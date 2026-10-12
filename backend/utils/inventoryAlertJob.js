// // import cron from "node-cron";
// import { runInventoryAlertCheck } from "./inventoryAlertService.js";

// // export function startInventoryAlertJob() {
//   const schedule = process.env.INVENTORY_CHECK_CRON || "* * * * *";

//   cron.schedule(schedule, async () => {
//     console.log("[Cron] Running inventory alert check...");
//     try {
//       const result = await runInventoryAlertCheck();
//       console.log("[Cron] Inventory check complete:", result);
//     } catch (err) {
//       console.error("[Cron] Inventory check failed:", err);
//     }
//   });

//   console.log(`[Cron] Inventory alert job scheduled: ${schedule}`);

//   setTimeout(async () => {
//     console.log("[Cron] Running startup inventory check...");
//     try {
//       await runInventoryAlertCheck();
//     } catch (err) {
//       console.error("[Cron] Startup check failed:", err);
//     }
//   }, 5000); // 5s delay so the server finishes booting
// }