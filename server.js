const http = require('http');
const fs = require('fs');

const { Player } = require('./game/class/player');
const { World } = require('./game/class/world');

const worldData = require('./game/data/basic-world-data');

let player;
let errorMessage = '';
let world = new World();
world.loadWorld(worldData);

const server = http.createServer((req, res) => {

  /* ============== ASSEMBLE THE REQUEST BODY AS A STRING =============== */
  let reqBody = '';
  req.on('data', (data) => {
    reqBody += data;
  });

  req.on('end', () => { // After the assembly of the request body is finished
    /* ==================== PARSE THE REQUEST BODY ====================== */
    console.log('player after collect body request', player);
    if (reqBody) {
      req.body = reqBody
        .split("&")
        .map((keyValuePair) => keyValuePair.split("="))
        .map(([key, value]) => [key, value.replace(/\+/g, " ")])
        .map(([key, value]) => [key, decodeURIComponent(value)])
        .reduce((acc, [key, value]) => {
          acc[key] = value;
          return acc;
        }, {});
    }

    /* ======================== ROUTE HANDLERS ========================== */
    const urlParts = req.url.split('/');
    
    // Phase 1: GET /
    if (req.method === 'GET' && req.url === '/') {// root = new-player.html
      let htmlTemplate = fs.readFileSync('./views/new-player.html', 'utf-8')
      let roomStrings = world.availableRoomsToString()
      let resultHtml = htmlTemplate.replace(/#{availableRooms}/g, roomStrings)
      // set code
      res.statusCode = 200; // ok
      // set header - content
      res.setHeader('Content-type', 'text/html');
      //set body
      res.write(resultHtml);
      // finish
      return res.end(); // can be res.end() only
      
    }
    // Phase 2: POST /player
    if (req.method === 'POST' && req.url === '/player') {// posted new-player from the form
      // obtaining roomId and player name from form request
      const {name, roomId: startingRoomId} = req.body;
      // create a new player
      const startingRoom = world.rooms[startingRoomId];
      player = new Player(name, startingRoom)
      // pass player to room

      // set code
      res.statusCode = 302; // ok
      // set header - content - redirect
      res.setHeader('Location', '/rooms/' + startingRoomId); 
      //set body - none
      // finish
      console.log('player after post player', player);
      return res.end(); // can be res.end() only
      
    }
    // All route handlers after phase 2 should require a player.
    if (!player) { //if no player of some reason (e.g using postman) then redirect to start
      redirect(res, '/');
      return;
    }  
    // Phase 3: GET /rooms/:roomId
    // if player exists, it always has a room - browser/form demand (but not postman)
    if (req.method === 'GET' && req.url.startsWith('/rooms/') && urlParts.length === 3) { // room page html
       
      // parse roomId from url req 
      let roomId = req.url.slice(req.url.lastIndexOf('/')+1);
      const room = world.rooms[roomId]
      if (room !== player.currentRoom) {
        // If room is not  current player's room, redirect to current room 
        redirect(res, '/rooms/' + player.currentRoom.id);
        return 
      };
      // prepare variables to replace:     
      
      let roomName = room.name //- specified room's name
      let roomItemsStr = room.itemsToString() // - list of the specified room's items
      let inventoryStr = player.inventoryToString(); // - list of the player's items
      let exitsStr = room.exitsToString(); // links to each of the rooms connected to the specified room
      
      let htmlTemplate = fs.readFileSync('./views/room.html', 'utf-8')
      
      let resultHtml = htmlTemplate
        .replace(/#{roomName}/g, roomName)
        .replace(/#{roomItems}/g, roomItemsStr)
        .replace(/#{inventory}/g, inventoryStr)
        .replace(/#{exits}/g, exitsStr);
      // set code
      res.statusCode = 200; // ok
      // set header - content
      res.setHeader('Content-type', 'text/html');
      //set body
      res.write(resultHtml);
      // finish
      return res.end(); // can be res.end() only
      
    }


    // Phase 4: GET /rooms/:roomId/:direction
    if (req.method === 'GET' && req.url.startsWith('/rooms/') && urlParts.length === 4) { // room page html
       
      // parse roomId from url req 
      let roomId = urlParts[2];
      let direction = urlParts[3]
      const room = world.rooms[roomId]
      if (room !== player.currentRoom) {
        // If room is not  current player's room, redirect to current room 
        redirect(res, '/rooms/' + player.currentRoom.id);
        return;
      };
      // move the player:
      try {
        player.move(direction[0])
        redirect (res, '/rooms/' + player.currentRoom.id);
      } catch (error) {
        // on error while move make GET request to error page
        // with possibility to return to the room  
        redirect (res, '/error')
        errorMessage = error;
        console.log('error', error);
      }
      return;

    }

    // Phase 5: POST /items/:itemId/:action

    if (req.method === 'POST' && req.url.startsWith('/items/')) { // posted item axion from the form
      // obtaining itemId and action from form url
      const itemId = urlParts[2];
      const action = urlParts[3];
      switch (action) {
        case 'drop':
          player.dropItem(itemId);
          break;
        case 'eat':
          try {
            player.eatItem(itemId);
          } catch (error) {
            errorMessage = error;
            redirect (res, '/error')
            return;
          };
          break;
        case 'take':
          player.takeItem(itemId);
      }
      redirect(res, '/rooms/' + player.currentRoom.id)
      return;      
    }

    // Error handling:
    if (req.method === 'GET' && req.url ==='/error') { //error page html
    
      const currentRoomId = player.currentRoom.id;
      // read template
      let htmlTemplate = fs.readFileSync('./views/error.html', 'utf-8')
      // replace variables:
      
      let resultHtml = htmlTemplate
        .replace(/#{errorMessage}/g, errorMessage)
        .replace(/#{roomId}/g, player.currentRoom.id)
      // set res
      res.statusCode = 200; // ok
      res.setHeader('Content-type', 'text/html');
      res.write(resultHtml);
      return res.end(); // can be res.end() only      
    }
    
    // Bonuses: CSS
    if (req.method === 'GET' && req.url.startsWith('/static/views/styles/')) { //static assets - css
      let fileName = urlParts[4];
      // read CSS
      let cssFile = fs.readFileSync('./views/styles/' + fileName, 'utf-8');

      res.statusCode = 200; // ok
      res.setHeader('Content-type', 'text/css');
      res.write(cssFile);
      return res.end(); // can be res.end() only      
    }
  
    // Phase 6: Redirect if no matching route handlers
    redirect(res, '/rooms/' + player.currentRoom.id)
    return;       
  })
});
//Bonus Phase: Add more rooms and items
// Add more interesting rooms and items to the seed. 
//You can even make different kinds of items that are not just food, 
//like weapons! 

// just description:
// for rooms - need to add rooms, proper exits and items in 
// basic-world-dat.js - quite obvious.
// for weapons need to add item subclass, like food , and actions

// You can also include
//logic that will change the CSS styling of the page when the player is holding a
// particular item. Like a flashlight!

// - for this can use variables in css and replace them on routing.
// - for initiating this vars can use additional player (or possible current room) properties 

function redirect(res, LocationUrl) {
  res.statusCode = 302; // 
      // set header - content - redirect
      res.setHeader('Location', LocationUrl);
      // finish
      return res.end()
}

const port = 5000;

server.listen(port, () => console.log('Server is listening on port', port));