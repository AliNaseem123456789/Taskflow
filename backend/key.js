import crypto from "node:crypto";
import fs from "node:fs";

const key = crypto.createPrivateKey({
  key: fs.readFileSync("E:/win-Acme-challenges/taskdoneflow.duckdns.org-key.pem"),
  passphrase: "12345"   // uncomment if this key is still encrypted
});

const cert = new crypto.X509Certificate(
  fs.readFileSync("E:/win-Acme-challenges/taskdoneflow.duckdns.org-chain.pem")
);

const keyPub = crypto.createPublicKey(key).export({ type: "spki", format: "der" });
const certPub = cert.publicKey.export({ type: "spki", format: "der" });

console.log(keyPub.equals(certPub) ? "MATCH — key and cert belong together" : "MISMATCH — these are from different cert requests");
console.log("Cert valid from:", cert.validFrom, "to", cert.validTo);