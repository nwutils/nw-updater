import Updater from "./updater.js";

const updater = new Updater("http://localhost:3000/releases/manifest.json");

async function handleCheckForUpdates() {
    const updateStatus = document.getElementById("update-status");
    updater.checkNewVersion((err, newerVersionExists, remoteManifest) => {
            updateStatus.textContent = "Checking for updates...";
        if (err) {
            updateStatus.textContent = `Error checking for updates: ${err.message}`;
            return;
        }
        if (newerVersionExists) {
            updateStatus.textContent = "A newer version is available.";
        } else {
            updateStatus.textContent = "No new version available.";
        }
    });
}
