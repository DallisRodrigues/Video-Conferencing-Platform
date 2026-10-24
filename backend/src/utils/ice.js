import crypto from "node:crypto";

// TURN_SECRET mints short-lived coturn credentials per request so the secret never reaches browsers;
// TURN_USERNAME/TURN_CREDENTIAL are static provider credentials.
export function buildIceServers(ice, identity = "guest") {
    const servers = [];
    if (ice.stunUrls.length) servers.push({ urls: ice.stunUrls });

    if (ice.turnUrls.length) {
        if (ice.turnSecret) {
            const expiry = Math.floor(Date.now() / 1000) + ice.turnTtlSeconds;
            const username = `${expiry}:${identity}`;
            const credential = crypto.createHmac("sha1", ice.turnSecret).update(username).digest("base64");
            servers.push({ urls: ice.turnUrls, username, credential });
        } else if (ice.turnUsername && ice.turnCredential) {
            servers.push({ urls: ice.turnUrls, username: ice.turnUsername, credential: ice.turnCredential });
        }
    }
    return servers;
}
