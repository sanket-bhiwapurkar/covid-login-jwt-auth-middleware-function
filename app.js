const express = require("express");
const app = express();
app.use(express.json());

const path = require("path");
const filePath = path.join(__dirname, "covid19IndiaPortal.db");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

let db = null;
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: filePath,
      driver: sqlite3.Database,
    });
    app.listen(3000);
    console.log("Server is running at http://localhost:3000/");
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

const responseSender = (response, code, text) => {
  response.status(code);
  response.send(text);
};

const stateSnakeToCamel = (dbObj) => ({
  stateId: dbObj.state_id,
  stateName: dbObj.state_name,
  population: dbObj.population,
});
const districtSnakeToCamel = (dbObj) => ({
  districtId: dbObj.district_id,
  districtName: dbObj.district_name,
  stateId: dbObj.state_id,
  cases: dbObj.cases,
  cured: dbObj.cured,
  active: dbObj.active,
  deaths: dbObj.deaths,
});

const authenticateToken = (request, response, next) => {
  const authHeader = request.headers["authorization"];
  let jwtToken;
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    responseSender(response, 401, "Invalid JWT Token");
    return;
  }
  jwt.verify(jwtToken, "123", async (error, payload) => {
    if (error) {
      responseSender(response, 401, "Invalid JWT Token");
    } else {
      request.username = payload.username;
      next();
    }
  });
};

//API 1 login
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(getUserQuery);
  if (dbUser === undefined) {
    responseSender(response, 400, "Invalid user");
    return;
  }
  const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
  if (!isPasswordMatched) {
    responseSender(response, 400, "Invalid password");
    return;
  } else {
    const payload = { username: username };
    const secretKey = "123";
    const jwtToken = jwt.sign(payload, secretKey);
    response.send({ jwtToken });
  }
});

//Get States
app.get("/states/", authenticateToken, async (request, response) => {
  const getStatesQuery = `SELECT * FROM state;`;
  const states = await db.all(getStatesQuery);
  let statesResponse = [];
  for (let state of states) {
    let newState = stateSnakeToCamel(state);
    statesResponse = statesResponse.concat(newState);
  }
  response.send(statesResponse);
});

//Get State
app.get("/states/:stateId", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateQuery = `SELECT * FROM state WHERE state_id = ${stateId};`;
  const state = await db.get(getStateQuery);
  const stateResponse = stateSnakeToCamel(state);
  response.send(stateResponse);
});

//Add district
app.post("/districts/", authenticateToken, async (request, response) => {
  const districtDetails = request.body;
  const {
    districtName,
    stateId,
    cases,
    cured,
    active,
    deaths,
  } = districtDetails;
  const addDistrictQuery = `INSERT INTO district (
        district_name,
        state_id,
        cases,
        cured,
        active,
        deaths
        ) VALUES (
            '${districtName}',
            ${stateId},
            ${cases},
            ${cured},
            ${active},
            ${deaths}
            );`;
  await db.run(addDistrictQuery);
  response.send("District Successfully Added");
});

//Get District
app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictQuery = `SELECT * FROM district WHERE district_id = ${districtId};`;
    const district = await db.get(getDistrictQuery);
    const districtResponse = districtSnakeToCamel(district);
    response.send(districtResponse);
  }
);

//Delete District
app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `DELETE FROM district WHERE district_id = ${districtId};`;
    await db.get(deleteDistrictQuery);
    response.send("District Removed");
  }
);

//Add District
app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const districtDetails = request.body;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = districtDetails;
    const updateDistrictQuery = `UPDATE district SET
    district_name = '${districtName}',
    state_id = ${stateId},
    cases = ${cases},
    cured = ${cured},
    active = ${active},
    deaths = ${deaths} WHERE district_id = ${districtId};`;
    await db.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);

//Get the statistics of a specific state
app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getStatsQuery = `SELECT
    SUM(cases) as totalCases,
    SUM(cured) as totalCured,
    SUM(active) as totalActive,
    SUM(deaths) as totalDeaths
    FROM district
    WHERE state_id = ${stateId};`;
    const stats = await db.get(getStatsQuery);
    response.send(stats);
  }
);

//Get State of District
app.get(
  "/districts/:districtId/details/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getStateNameQuery = `SELECT state_name as stateName FROM state WHERE state_id = (SELECT state_id FROM district WHERE district_id = ${districtId});`;
    const stateName = await db.get(getStateNameQuery);
    response.send(stateName);
  }
);

module.exports = app;
