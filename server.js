const HOSTNAME = 'localhost';

const rooms = new Map();
const sessions = new Map();

const express = require("express");
const app = express();
app.use(express.static('public'));
app.listen(8000, HOSTNAME,() => {
    console.log(`express serving on ${HOSTNAME}:8000`)
})

const io = require("socket.io")(3000, {
    cors:{ origin: [`http://${HOSTNAME}:8000`] }
});

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

//AUTH
io.use((socket, next) =>{
    const token = socket.handshake.auth.token;
    if(!sessions.has(token)) {
        sessions.set(token, {});
        sessions.get(token).socket = socket.id;
    }
    else{//refreshed
        //console.log(`${sessions.get(token).socket} => ${socket.id}`)
        sessions.get(token).socket = socket.id;
        if(sessions.get(token).hasOwnProperty("room")) {
            socket.join(sessions.get(token).room);
            rooms.get(sessions.get(token).room).socket = socket;
            socket.emit('restore', token === rooms.get(sessions.get(token).room).sessions[0]);
        }
    }
    next();
})

class room{
    constructor(roomID){
        //player data
        this.sessions = [];
        this.names = [];

        this.roomID = roomID;

        //console.log(this.roomID);
        this.state = 0; //0-queue   1-voting    2-results
        this.next = false;
        this.ready = true;

        this.votes = new Map();
        this.sorted = {};

        this.points = new Map();

        this.Q = 0;
        this.qOrder = [];
        for(let i=0; i<questions.length; i++) this.qOrder.push(i);
        for(let i=0; i<questions.length ** 2; i++) {
            let l = Math.floor(Math.random() * questions.length), r = Math.floor(Math.random() * questions.length);
            const tmp = this.qOrder[l];
            this.qOrder[l] = this.qOrder[r];
            this.qOrder[r] = tmp;
        }
    }
    addPoints(winSessions){
        for(let i=0; i<winSessions.length; i++) {
            if(this.points.has(winSessions[i])){
                this.points.set(winSessions[i], this.points.get(winSessions[i]) + 1);
            }
            else{
                this.points.set(winSessions[i], 1);
            }
        }
    }
    isHost(session){
        //console.log(`${session} ${this.sessions[0]}`)
        return session === this.sessions[0];
    }
    emitPlayers(){
        io.to(this.roomID).emit('players-update', this.names);
    }
}

const fs = require("fs");
let questions = [];
loadQs();
function loadQs(){
    fs.readFile('questions.txt', (err, data) => {
        questions = data.toString().split('\r\n');
        //console.log(questions);
    });
}

io.on('connection', (socket) => {
    const SESSION = socket.handshake.auth.token;
    console.log(`${socket.id} connected on token ${SESSION}`);


    if(sessions.get(SESSION).room !== undefined && rooms.has(sessions.get(SESSION).room)){       //if user reconnected
        socket.emit('host', rooms.get(sessions.get(SESSION).room).isHost(SESSION) ? 'true' : 'false');
        socket.emit('setfoot', sessions.get(SESSION).room);
        const state = parseInt(rooms.get(sessions.get(SESSION).room).state);
        if(state === 0){
            //queue
            socket.emit('queue', sessions.get(SESSION).room);
        }
        else if(state === 1){
            //voting
            if(!rooms.get(sessions.get(SESSION).room).votes.has(SESSION)) {
                const QUESTION = questions[rooms.get(sessions.get(SESSION).room).Q];
                socket.emit('question', QUESTION, rooms.get(sessions.get(SESSION).room).names);
            }
            else {
                socket.emit('awaitresults');
            }
        }
        else if(state === 2){
            //results
            socket.emit('results', rooms.get(sessions.get(SESSION).room).sorted);
        }

        const socketRoom = sessions.get(SESSION).room.toString();
        socket.join(socketRoom);
    }
    else{
        socket.emit('menu');
    }

    //id(sessions.get(SESSION).room )
    //console.log(sessions);

    socket.on('joinroom', (username, roomID, callback) => {
        if(rooms.has(roomID)){
            sessions.get(SESSION).room = roomID;
            sessions.get(SESSION).name = username;
            rooms.get(roomID).sessions.push(SESSION);
            rooms.get(roomID).names.push(username);
            console.log(`${username} joined ${roomID}. Current players: ${rooms.get(roomID).sessions.length}`);
            rooms.get(roomID).emitPlayers();
            socket.join(roomID);
            callback(true);
        }
        else {
            console.log(`${username} tried to join ${roomID} (doesn't exist)`);
            callback(false);
        }
    });

    socket.on('newroom', async (username, callback) =>{
        let numberValid = false, roomID;
        while(!numberValid){
            roomID = Math.floor(Math.random() * 899999) + 100000;
            roomID = roomID.toString();
            if(!rooms.has(roomID)) numberValid = true;
        }
        rooms.set(roomID, new room(roomID));
        rooms.get(roomID).sessions.push(SESSION);
        //rooms.get(roomID).sockets.push(socket.id);
        rooms.get(roomID).names.push(username);
        socket.join(roomID);
        sessions.get(SESSION).room=roomID;
        sessions.get(SESSION).name=username;

        //rooms.get(roomID).updatePlayers();//emit message
        callback(roomID);
    });

    socket.on('getplayers', ()=>{
        if(isSafe(SESSION)) {
            console.log(rooms.get(sessions.get(SESSION).room).names);
            if (rooms.has(sessions.get(SESSION).room))
                socket.emit('players-update', rooms.get(sessions.get(SESSION).room).names);
        }
    });

    socket.on('kick', (i, callback) => {
        if(isSafe(SESSION)) {
            const socketRoom = sessions.get(SESSION).room;
            if (rooms.get(socketRoom).isHost(SESSION)) {
                console.log(`kicked ${rooms.get(socketRoom).names[i]}`);
                io.to(sessions.get(rooms.get(socketRoom).sessions[i]).socket).emit('kickinfo'); //info to kicked client
                sessions.delete(rooms.get(socketRoom).sessions[i]);                             //delete kicked session
                rooms.get(socketRoom).sessions.splice(i, 1);                         //delete kicked from room
                rooms.get(socketRoom).names.splice(i, 1);                            // -,-
                //rooms.get(socketRoom).sockets.splice(i, 1);
                rooms.get(socketRoom).emitPlayers();
            } else if (i === -1) {
                console.log(`${rooms.get(socketRoom).names[i]} left room`);
                socket.emit('kickinfo');
                sessions.delete(SESSION);                             //delete kicked session
                for (i = 0; i < rooms.get(socketRoom).sessions.length; i++) {
                    if (rooms.get(socketRoom).sessions[i] === SESSION) break;
                }
                rooms.get(socketRoom).sessions.splice(i, 1);                         //delete kicked from room
                rooms.get(socketRoom).names.splice(i, 1);                            // -,-
                //rooms.get(socketRoom).sockets.splice(i, 1);
                rooms.get(socketRoom).emitPlayers();
            }
        }
        //rooms.get(socketRoom).updatePlayers();
    })

    socket.on('endgame', ()=>{
        if(isSafe(SESSION)) {
            const socketRoom = sessions.get(SESSION).room
            if (rooms.get(socketRoom).isHost(SESSION)) {
                for (let i = 0; i < rooms.get(socketRoom).sessions.length; i++)
                    sessions.delete(rooms.get(socketRoom).sessions[i]);
                console.log(rooms.get(socketRoom).points);
                rooms.delete(socketRoom);
                io.to(socketRoom).emit('kickinfo');
            }
        }
    });

    socket.on('startrequest', async ()=>{
        if(isSafe(SESSION)) {
            if (rooms.get(sessions.get(SESSION).room).state === 0 && rooms.get(sessions.get(SESSION).room).isHost(SESSION)) {
                console.log(`Game started`);
                rooms.get(sessions.get(SESSION).room).state = 1;
                await runGame(sessions.get(SESSION).room, socket);
            } else console.log("Game already started");
        }
    });

    socket.on('continue', ()=>{
        if(isSafe(SESSION)) {
            if (rooms.has(sessions.get(SESSION).room) && rooms.get(sessions.get(SESSION).room).isHost(SESSION) &&
                rooms.get(sessions.get(SESSION).room).state === 2) {
                console.log("Allowed next question");
                rooms.get(sessions.get(SESSION).room).next = true;
            }
        }
    })

    socket.on('vote', (val) =>{
        if(isSafe(SESSION)){
            val = parseInt(val);
            let c1 = (val >= 0) && (val <=rooms.get(sessions.get(SESSION).room).names.length);
            let c2 = Number.isInteger(val);
            let c3 = !rooms.get(sessions.get(SESSION).room).votes.has(SESSION);
            let c4 = rooms.get(sessions.get(SESSION).room).state === 1;
            //console.log(`${c1}, ${c2}, ${c3}, ${c4} `)
            if(c1 && c2 && c3 && c4){
                rooms.get(sessions.get(SESSION).room).votes.set(SESSION, val);
            }
        }
    })

    socket.on('disconnect', (reason)=>{
        //if(sessions.get(SESSION).hasOwnProperty("room")) {
        //const room = sessions.get(SESSION).room;
        //if (rooms.get(room).sessions[0] === SESSION) {
        //    rooms.get(room).host = false;
        //}
        //}
        console.log(`${socket.id} disconnected`);
    })

});

async function runGame(roomID, socket){
    roomID = roomID.toString();
    await delay(100);

    for(let QI = 0; QI < questions.length; QI++) {
        rooms.get(roomID).state = 1;
        rooms.get(roomID).next = false;
        rooms.get(roomID).ready = false;
        let QUESTION = questions[rooms.get(roomID).qOrder[QI]];
        rooms.get(roomID).Q = rooms.get(roomID).qOrder[QI];
        //console.log(QUESTION);
        //console.log(rooms.get(roomID).players);
        //console.log(io.sockets.sockets.get(socket.id));

        rooms.get(roomID).votes.clear();                //clear votes buffer

        //const sockets = rooms.get(roomID).sockets;
        io.to(roomID).emit('question', QUESTION, rooms.get(roomID).names);
        io.to(roomID).emit('time', 0);
        //for (let i = 0; i < sockets.length; i++) {
        //    io.to(sockets[i]).emit('question', QUESTION, rooms.get(roomID).names);
        //}
        const voted = await awaitVote(roomID);
        await delay(1000);
        const votes = rooms.get(roomID).votes;
        rooms.get(roomID).state = 2;
        console.log(rooms.get(roomID).votes);
        let results = [];
        for (let i = 0; i < rooms.get(roomID).names.length; i++) results.push(0);
        votes.forEach((val, key)=>{
            results[val]++;
        })

        let winSessions = [];
        let max = results[0];
        for (let i = 0; i < results.length; i++)
            if (results[i] > max) max = results[i];
        for (let i = 0; i < rooms.get(roomID).sessions.length; i++) {
            if (results[i] === max) winSessions.push(rooms.get(roomID).sessions[i]);
        }
        rooms.get(roomID).addPoints(winSessions);

        let resOut = {};
        for (let i = 0; i < rooms.get(roomID).names.length; i++)
            resOut[rooms.get(roomID).names[i]] = results[i];
        resOut = sortByPoints(resOut);
        console.log(JSON.stringify(resOut));
        rooms.get(roomID).sorted = resOut;
        io.to(roomID.toString()).emit('results', resOut);

        rooms.get(roomID).ready = true;

        const play = await awaitContinue(roomID);
        if (play === false) return;
    }
}

function closeRoom(roomID){
    rooms.delete(roomID);
}

async function awaitContinue(roomID) {
    return new Promise(async (resolve) => {
        while(rooms.has(roomID) && (rooms.get(roomID).next === false || rooms.get(roomID).ready === false))
            await delay(500);
        resolve(rooms.has(roomID));
    });
}

async function awaitVote(roomID) {
    if (rooms.has(roomID)){
        const timeout = 20 * 1000;
        const interval = 1000;
        const start = Date.now();
        return new Promise((resolve) => {
            const check = setInterval(() => {
                let k = (Date.now() - start) / (timeout) * 100;
                if(k>100)k=100;
                io.to(roomID).emit('time', k);
                //console.log(rooms.get(roomID).votes.size);
                //console.log(rooms.get(roomID).sockets.length);
                if (rooms.get(roomID).votes.size === rooms.get(roomID).sessions.length) {
                    clearInterval(check);
                    resolve(1);
                } else if (Date.now() - start >= timeout) {
                    clearInterval(check);
                    resolve(0);
                }
            }, interval);
        });
    }
    else return -1;
}

function sortByPoints(jsonObject) {
    const sortedArray = Object.entries(jsonObject).sort((a, b) => b[1] - a[1]);
    return Object.fromEntries(sortedArray);
}

function isSafe(SESSION){
    if(sessions.has(SESSION) && sessions.get(SESSION).room !== undefined && rooms.has(sessions.get(SESSION).room))
        return true;
    else
        return false;
}