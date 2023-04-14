import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import Joi from "joi";
import dayjs from "dayjs";
import { stripHtml } from "string-strip-html";

const app = express();

app.use(express.json());
app.use(cors());
dotenv.config();

const participantSchema = Joi.object({
  name: Joi.string().required(),
  lastStatus: Joi.number()
});

const messageSchema = Joi.object({
  to: Joi.string().required(),
  text: Joi.string().required(),
  type: Joi.string().required()
});

let db;
const mongoClient = new MongoClient(process.env.DATABASE_URL);
try {
  await mongoClient.connect();
  db = mongoClient.db();
} catch (err) {
  console.log(err.message);
}

app.post("/participants", async (req, res) => {
  let { name } = req.body;
  name = stripHtml(name).result;
  const lastStatus = Date.now();
  try {
    const newParticipant = await participantSchema.validateAsync({ name, lastStatus });
    const result = await db.collection("participants").find({ name }).toArray();
    if (result.length !== 0) return res.sendStatus(409);
    await db.collection("participants").insertOne(newParticipant);
    const message = { from: name, to: 'Todos', text: 'entra na sala...', type: 'status', time: dayjs().format("HH:mm:ss") };
    await db.collection("messages").insertOne(message);
    res.sendStatus(201);
  } catch (error) {
    if (error.details) return res.status(422).send(error.details[0].message);
    res.status(500).send(error.message);
  }

});

app.get("/participants", async (req, res) => {
  let participants = [];
  try {
    participants = await db.collection("participants").find().toArray();
  } catch (error) {
    return res.send(error);
  }
  res.send(participants);
});

app.post("/messages", async (req, res) => {
  let { to, type, text } = req.body;
  to = stripHtml(to).result;
  type = stripHtml(type).result;
  text = stripHtml(text).result;
  let { user } = req.headers;
  user = stripHtml(user).result;

  if (type !== "message" && type !== "private_message") return res.sendStatus(422);
  try {
    const result = await db.collection("participants").find({ name: user }).toArray();
    if (result.length === 0) return res.status(422).send("Você não faz parte da sala");
    await Joi.assert(req.body, messageSchema);
    const message = { from: user, to, text, type, time: dayjs().format("HH:mm:ss") };
    await db.collection("messages").insertOne(message);
    res.sendStatus(201);
  } catch (error) {
    console.log(error);
    res.status(422).send(error.details[0].message);
  }
});

app.get("/messages", async (req, res) => {
  let messages = [];
  let { limit } = req.query;
  const { user } = req.headers;

  if (!user) return res.sendStatus(422);
  if (limit !== undefined && (isNaN(Number(limit)) || Number(limit) <= 0)) return res.sendStatus(422);
  try {
    messages = await db.collection("messages").find({ $or: [{ to: user }, { from: user }, { type: { $in: ["message", "status"] } }] }).toArray();
    if (limit !== undefined) {
      return res.send(messages.slice(-Number(limit)));
    }
    res.send(messages);
  } catch (error) {
    console.log(error);
    return res.send(error);
  }
});

app.post("/status", async (req, res) => {
  const { user } = req.headers;
  if (!user) return res.sendStatus(404);
  try {
    const result = await db.collection("participants").find({ name: user }).toArray();
    if (result.length === 0) return res.sendStatus(404);
    const newDate = Date.now();
    await db.collection("participants").updateOne({ name: user }, { $set: { lastStatus: newDate } });
    res.sendStatus(200);
  } catch (err) {
    res.sendStatus(500);
  }
});

app.delete("/messages/:id", async (req, res) => {
  const { id } = req.params;
  let { user } = req.headers;
  user = stripHtml(user).result;
  try {
    const message = await db.collection("messages").findOne({ _id: new ObjectId(id) });
    if (!message) return res.status(404).send("A mensagem não existe.");
    if (message.from !== user) return res.status(401).send("Você não é o dono dessa mensagem!");
    const resultDelete = await db.collection("messages").deleteOne({ _id: new ObjectId(id) });
    if (!resultDelete) return res.status(404).send("A mensagem não existe.");
    res.status(200).send("Mensagem deletada com sucesso!");
  } catch (err) {
    console.log(err);
  }
});

app.put("/messages/:id", async (req, res) => {
  let { to, type, text } = req.body;
  to = stripHtml(to).result;
  type = stripHtml(type).result;
  text = stripHtml(text).result;
  let { user } = req.headers;
  user = stripHtml(user).result;
  const { id } = req.params;

  try {
    if (type !== "message" && type !== "private_message") return res.sendStatus(422);
    const result = await db.collection("participants").findOne({ name: user });
    if (!result) return res.status(422).send("Você não faz parte da sala");
    const message = await db.collection("messages").findOne({ _id: new ObjectId(id) });
    if (!message) return res.status(404).send("A mensagem não existe!");
    if (message.from !== user) return res.status(401).send("Você não é o dono dessa mensagem!");
    await Joi.assert(req.body, messageSchema);
    const newMessage = { from: user, to, text, type, time: dayjs().format("HH:mm:ss") };
    await db.collection("messages").updateOne({ _id: new ObjectId(id) }, { $set: newMessage });
    res.send("Mensagem atualizada com sucesso");
  } catch (error) {
    console.log(error);
    res.status(422).send(error.details[0].message);
  }
});

const inactiveTime = 15000;
setInterval(async () => {
  try {
    const inactiveDate = Date.now() - 10000;
    const result = await db.collection("participants").find({ lastStatus: { $lt: inactiveDate } }).toArray();
    result.map(async (el) => {
      const message = { from: el.name, to: 'Todos', text: 'sai da sala...', type: 'status', time: dayjs().format("HH:mm:ss") };
      await db.collection("messages").insertOne(message);
    });
    await db.collection("participants").deleteMany({ lastStatus: { $lt: inactiveDate } });

  } catch (err) {
    console.log(err);
  }
}, inactiveTime);

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));