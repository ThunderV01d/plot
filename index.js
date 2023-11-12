const { WebSocket, WebSocketServer } = require('ws');
const http = require('http');
const uuidv4 = require('uuid').v4;

// Spinning the http server and the WebSocket server.
const server = http.createServer();
const wsServer = new WebSocketServer({ server });
const port = 8000;
server.listen(port, () => {
  console.log(`WebSocket server is running on port ${port}`);
});

//All game constants
const maxPlayers = 3;
const roles = {'imposter':1}
roles['crewmate'] = maxPlayers-roles['imposter'];
const waitingDuration = 5;
const gameDuration = 5*60;  //in seconds
const preGameDuration = 5;  //in seconds
const tasks = {
  "flappy":{name:"Flappy Bird",description:"I WANT TO FUCK A MONKEY"},
  "wire-maze":{name:"Wire Maze Game",description:"I WANT TO FUCK A MONKEY"},
  "jenga":{name:"Jenga Tower",description:"I WANT TO FUCK A MONKEY"},
  "simon":{name:"Simon",description:"I WANT TO FUCK A MONKEY"},
  "globe":{name:"Globe Finding",description:"I WANT TO FUCK A MONKEY"},
  "mystery-number":{name:"Mystery Number",description:"I WANT TO FUCK A MONKEY"},
  "treasure":{name:"TREASURE HUNT",description:"I WANT TO FUCK A MONKEY"},
  "briefcase":{name:"OPEN THE BRIEFCASE",description:"I WANT TO FUCK A MONKEY"}
}
const typesDef = {
  PLAYER_EVENT: 'playerEvent',
  LOBBY_FULL_SIGNAL: "lobbyFull",
  MAX_PLAYER_RETRIEVAL:"checkMaxPlayers",
  // PREGAME_STARTED_SIGNAL:"pregameStarted",
  // GAME_STARTED_SIGNAL:"gameStarted",
  GAME_ENDED_SIGNAL:"gameEnded",
  TIMER_BROADCAST: "broadcastTime",
  ROLE_REQUEST: "requestRole",
  TASK_EVENT: 'taskEvent',
  ALL_PLAYERS_REQUEST: "requestAllPlayers",
  USERNAME_REQUEST: "requestUsername",
  KILL_PLAYER_REQUEST: "killPlayer",
  VOTE_PLAYER_REQUEST: "votePlayer"
}

//All game variables
var clients = {};
var players = {};
var votes = {};
var lobbyFull = false;
var timers = {
  waitingTimer: {},
  preGameTimer: {},
  gameTimer: {},
};
var assignedColors=[]

//function to reset all variables
function endSession(){
  players = {}
  lobbyFull = false;
  timers = {
    waitingTimer: {},
    preGameTimer: {},
    gameTimer: {},
  };
  assignedColors=[];
  votes = {};
}


function assignColor() {
    const availableColors = [
        "RED", "BLUE", "GREEN", "PINK", "ORANGE",
        "YELLOW", "BLACK", "WHITE", "PURPLE", "BROWN"
    ];
    // Shuffle the available colors to ensure randomness
    for (let i = availableColors.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availableColors[i], availableColors[j]] = [availableColors[j], availableColors[i]];
    }
    // If we've assigned all colors, return a message or handle accordingly
    if (assignedColors.length >= availableColors.length) {
        return "";
    }
    // Find an available color
    let color;
    for (let i = 0; i < availableColors.length; i++) {
        if (!assignedColors.includes(availableColors[i])) {
        color = availableColors[i];
        break;
        }
    }
    // If a color is found, assign it to the user
    if(color){
        assignedColors.push(color);
        return color;
    }
    return "";
}

function unassignColor(color) {
    const index = assignedColors.indexOf(color);
    if (index !== -1) {
      assignedColors.splice(index, 1);
      return true; // Color successfully unassigned
    }
    return false; // Color not found in the array
}

function assignRoles() {
  // Create an array of available roles based on the roles object
  const availableRoles = Object.keys(roles).flatMap((role) => Array(roles[role]).fill(role));

  // Shuffle the array of available roles to make the assignment random
  for (let i = availableRoles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [availableRoles[i], availableRoles[j]] = [availableRoles[j], availableRoles[i]];
  }

  // Assign roles to players
  const playerIds = Object.keys(players);
  playerIds.forEach((userId, index) => {
    const role = availableRoles[index];
    players[userId].role = role;
  });
}

function assignTasks(){
  const taskKeys = Object.keys(tasks);
  for (const id in players) {
    const shuffledTasks = taskKeys.sort(() => Math.random() - 0.5);
    players[id].tasks = shuffledTasks.slice(0,3).reduce((obj,item) => {
      obj[item] = false;
      return obj;
    },{});
  }
  console.log("ASSIGNED TASKS!: ",players);
}
function assignStatus(){
  for (const id in players) {
    players[id].alive = true;
  }
}
function startWaitingTimer() {
  timers.waitingTimer['start time'] = Date.now();
  timers.waitingTimer['timer'] = setTimeout(() => {
    console.log("Waiting timer expired!");
    // Perform actions when the timer expires
    clearInterval(timers.waitingTimer['interval']);
    startPreGameTimer();
    assignTasks();
  }, waitingDuration*1000);
  const intervalId = setInterval(() => {
    const elapsedTime = Date.now() - timers.waitingTimer['start time'];      
    const timeLeft = Math.max(0, Math.floor((waitingDuration*1000 - elapsedTime) / 1000));
    broadcastMessage({
      type: 'broadcastTime',
      data: timeLeft
    });
  }, 1000);
  timers.waitingTimer['interval'] = intervalId;
}

// Start a 5-second timer
function startPreGameTimer() {
  timers.preGameTimer['start time'] = Date.now();
  timers.preGameTimer['timer'] = setTimeout(() => {
    console.log("Pre game timer expired!");
    clearInterval(timers.preGameTimer['interval']);
    startGameTimer();
    assignStatus();
  }, preGameDuration*1000);
  const intervalId = setInterval(() => {
    const elapsedTime = Date.now() - timers.preGameTimer['start time'];   
    const timeLeft = Math.max(0, Math.floor((preGameDuration*1000 - elapsedTime) / 1000));
    broadcastMessage({
      type: 'broadcastTime',
      data: timeLeft
    });
  }, 1000);
  timers.preGameTimer['interval'] = intervalId;
}

// Start a 15-minute timer
function startGameTimer() {
  timers.gameTimer['start time'] = Date.now();
  timers.gameTimer['timer'] = setTimeout(() => {
    console.log("Game timer expired!");
    clearInterval(timers.gameTimer['interval']);
    broadcastMessage({
      type: typesDef.GAME_ENDED_SIGNAL,
      data: 'Imposter'
    })
    endSession();
  }, gameDuration * 1000);
  const intervalId = setInterval(() => {
    const elapsedTime = Date.now() - timers.gameTimer['start time'];   
    const timeLeft = Math.max(0, Math.floor((gameDuration* 1000 - elapsedTime) / 1000));
    broadcastMessage({
      type: 'broadcastTime',
      data: timeLeft
    });
  }, 1000);
  timers.gameTimer['interval'] = intervalId;
}

// Stop the 15-minute timer
function stopGameTimer() {
  if (timers.gameTimer['timer']) {
    clearInterval(timers.gameTimer['interval']);
    clearTimeout(timers.gameTimer['timer']);
    console.log("Game timer stopped.");
  }
}
//kill a player
function killPlayer(targetPlayer) {
  for (const playerId in players) {
      if (players.hasOwnProperty(playerId)) {
          const player = players[playerId];
          if (player.username === targetPlayer) {
              console.log(player.username);
              player.alive = false;
              unicastMessage(clients[playerId], {
                  type: typesDef.KILL_PLAYER_REQUEST
              });
              //check if all crewmates dead
              const crewmatesDead = Object.values(players).filter(player => player.role === 'crewmate').every(player => player.alive === false);
              if (crewmatesDead) {
                  broadcastMessage({
                      type: typesDef.GAME_ENDED_SIGNAL,
                      data: 'Imposter'
                  });
                  stopGameTimer();
                  endSession();
                  return;
              }
              //check if all imposters dead
              const impostersDead = Object.values(players).filter(player => player.role === 'imposter').every(player => player.alive === false);
              if (impostersDead) {
                  broadcastMessage({
                      type: typesDef.GAME_ENDED_SIGNAL,
                      data: 'Crewmates'
                  });
                  stopGameTimer();
                  endSession();
              }
              break;
          }
      }
  }
}
function determineHighestVotes() {
  let maxVotes = -1;
  let targetPlayer = null;
  let tie = false;

  // Iterate through the votes to find the player with the highest votes
  for (const username in votes) {
      const playerVotes = votes[username].votes;
      if (playerVotes > maxVotes) {
          maxVotes = playerVotes;
          targetPlayer = username;
          tie = false; // Reset tie flag if a new max is found
      } else if (playerVotes === maxVotes) {
          tie = true; // Set tie flag if votes are tied
      }
  }
  return tie ? null : targetPlayer;
}

function traceCurrentData(){
  console.log("Clients: ",Object.keys(clients));
  console.log("Players: ",players);
  console.log("Assigned Colors: ",assignedColors);
}

function broadcastMessage(json) {
  // We are sending the current data to all connected clients
  const data = JSON.stringify(json);
  for(let userId in clients) {
    let client = clients[userId];
    if(client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  };
  console.log(`sent ${data} to all clients.`);
}

function unicastMessage(client, json) {
  const data = JSON.stringify(json);
  if (client.readyState === WebSocket.OPEN) {
    client.send(data);
    console.log(`Sent unicast message to client: ${data}`);
  } else {
    console.log(`Client is not in OPEN state; message not sent.`);
  }
}

function handleMessage(message, userId) {
    const dataFromClient = JSON.parse(message.toString());
    const json = { type: dataFromClient.type };
    if (dataFromClient.type === typesDef.PLAYER_EVENT) {
      players[userId] = {username: dataFromClient.username, color: assignColor()};
      json.data = {players};
      broadcastMessage(json);
      if(Object.keys(players).length==maxPlayers){
        lobbyFull = true;
        broadcastMessage({
          type: typesDef.LOBBY_FULL_SIGNAL,
          data: lobbyFull
        });
        assignRoles();
        startWaitingTimer();
        return;
      }
    }
    else if (dataFromClient.type === typesDef.LOBBY_FULL_SIGNAL) {
      json.data = lobbyFull;
    }
    else if (dataFromClient.type === typesDef.MAX_PLAYER_RETRIEVAL){
      json.data = maxPlayers;
    }
    else if(dataFromClient.type === typesDef.ROLE_REQUEST){
      json.data = players[userId].role;
    }
    else if(dataFromClient.type === typesDef.TASK_EVENT){
      if(!dataFromClient.data){ //read mode
        const ptasks = {};
        if(players[userId].hasOwnProperty('tasks')){
          for (const task in players[userId].tasks) {
            if (players[userId].tasks.hasOwnProperty(task) && tasks.hasOwnProperty(task)) {
              ptasks[task] = { ...tasks[task], completed: players[userId].tasks[task] };
            }
          }
        }
        
        json.data = ptasks;
      }
      else{  //write
        if(!Object.keys(players).length){
          console.log(`Recieved late request from client ${userId}`);
          return;
        }
        const ptasks = {};
        for (const task in dataFromClient.data) {
          if (dataFromClient.data.hasOwnProperty(task)) {
            ptasks[task] = dataFromClient.data[task].completed;
          }
        }
        players[userId].tasks = ptasks;
        for(let player in players){
          for(let task in players[player].tasks){
            console.log(players[player].tasks);
            if (players[player].tasks[task]===false){
              return;
            }
          }
        }
        //end the game
        broadcastMessage({
          type: typesDef.GAME_ENDED_SIGNAL,
          data: 'Crewmates'
        })
        stopGameTimer();
        endSession();
        return;
      }
    }
    else if(dataFromClient.type === typesDef.USERNAME_REQUEST){
      if(userId in players){
        json.data = players[userId].username;
      }
      else{
        console.log("Found an unknown username request!");
        return;
      };
    }
    else if(dataFromClient.type === typesDef.ALL_PLAYERS_REQUEST){
      json.data = players;
    }
    else if(dataFromClient.type === typesDef.KILL_PLAYER_REQUEST){
      killPlayer(dataFromClient.data);
      return;
    }
    else if(dataFromClient.type === typesDef.VOTE_PLAYER_REQUEST){
      if(dataFromClient.data){//write mode
        if(dataFromClient.data === 'init'){
          broadcastMessage(json);
          return;
        }
        votes = dataFromClient.data;
        json.data = votes;
        broadcastMessage(json);
        const allPlayersVoted = Object.values(votes).every(player => player.voted);
        if (allPlayersVoted) {
          const targetPlayer = determineHighestVotes();
          if (targetPlayer) {
            broadcastMessage({
              type: typesDef.VOTE_PLAYER_REQUEST,
              data: 'ejected'
            });
            killPlayer(targetPlayer);
          }
          else{
            broadcastMessage({
              type: typesDef.VOTE_PLAYER_REQUEST,
              data: 'tie'
            });
          }
          setTimeout(() => {
            broadcastMessage({
              type: typesDef.VOTE_PLAYER_REQUEST,
              data: 'completed'
            });
          }, 2000);
        }
        return;
      }
      else {// read mode
        if (Object.keys(votes).length === 0) {// initialize votes
          Object.keys(players).forEach(clientID => {
            const username = players[clientID].username;
            if (players[clientID].alive) {
              votes[username] = { votes: 0, voted: false };
            }
          });
        } else {
          // Remove only dead players from votes object
          const updatedVotes = {};
          for (const username in votes) {
            const clientID = Object.keys(players).find(clientID => players[clientID].username === username);
            if (votes.hasOwnProperty(username) && players[clientID]?.alive) {
              updatedVotes[username] = votes[username];
              updatedVotes[username].votes = 0;
              updatedVotes[username].voted = false;
            }
          }
          votes = updatedVotes;
        }
        json.data = votes;
      }
    }
    //traceCurrentData();
    unicastMessage(clients[userId],json);
}

function handleDisconnect(userId) {
    console.log(`${userId} disconnected.`);
    const json = { type: typesDef.PLAYER_EVENT };
    const username = players[userId]?.username || userId;
    json.data = {players};
    unassignColor(players[userId]?.color || '');
    delete clients[userId];
    delete players[userId];
    traceCurrentData();
    broadcastMessage(json);
}

// A new client connection request received
wsServer.on('connection', function(connection) {
  // Generate a unique code for every user
  const userId = uuidv4();
  console.log('Recieved a new connection');

  // Store the new connection and handle messages
  clients[userId] = connection;
  console.log(`${userId} connected.`);
  connection.on('message', (message) => handleMessage(message, userId));
  // User disconnected
  connection.on('close', () => handleDisconnect(userId));
});
