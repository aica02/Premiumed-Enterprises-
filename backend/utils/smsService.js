import axios from "axios";

export async function sendSMS(phoneNumber, message) {
  const cleanPhone = phoneNumber.replace(/\s/g, "");

  if (!cleanPhone.match(/^\+[0-9]{10,15}$/)) {
    throw new Error("Invalid phone number format. Use format: +63XXXXXXXXXX");
  }

  if (!process.env.UNISMS_SECRET_KEY) {
    throw new Error("UNISMS_SECRET_KEY is not configured");
  }

  const cleanMessage = message
    .replace(/[!]+/g, "!")
    .replace(/[?]+/g, "?")
    .trim();
  const senderId = process.env.UNISMS_SENDER_ID || "UniSMS";

  const payload = {
    recipient: cleanPhone,
    content: cleanMessage,
    sender_id: senderId,
  };

  console.log("[sendSMS] --- OUTGOING SMS ---");
  console.log("[sendSMS] Recipient:", cleanPhone);
  console.log("[sendSMS] Sender ID:", senderId);
  console.log("[sendSMS] Content length:", cleanMessage.length, "chars");
  console.log("[sendSMS] Payload:", JSON.stringify(payload, null, 2));

  const response = await axios.post(
    "https://unismsapi.com/api/sms",
    payload,
    {
      auth: { username: process.env.UNISMS_SECRET_KEY, password: "" },
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      timeout: 30000,
    }
  );

  console.log("[sendSMS] --- SUCCESS ---");
  console.log("[sendSMS] Response:", JSON.stringify(response.data, null, 2));

  return response.data;
}