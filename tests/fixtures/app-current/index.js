import Updater from "./updater.js";
const manifest = nw.require("./package.json");

let updater;
document.addEventListener("DOMContentLoaded", () => {
    updater = new Updater(manifest);
    document.getElementById("check-for-updates-button").addEventListener("click", handleCheckForUpdates);
});

function handleCheckForUpdates() {
    const updateStatus = document.getElementById("update-status");
    updateStatus.textContent = "Checking for updates...";
    updater.checkNewVersion((err, newerVersionExists, remoteManifest) => {
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
