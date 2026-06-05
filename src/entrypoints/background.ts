/**
 * Service worker entry. Kept minimal for v1 — sign-in and storage live in the popup.
 * Firebase initialization, if needed in a future milestone, happens through `src/lib/firebase.ts`.
 */
export default defineBackground(() => {
  // No-op for now. WXT requires the entrypoint to exist so the manifest carries a
  // `background.service_worker` field for MV3.
});
