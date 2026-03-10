import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

/**
 * Scene loading & setup, loading screen
 */

const scene = new THREE.Scene();
const fov = 75;
const aspect = window.innerWidth / window.innerHeight;
const near = 0.1;
const far = 5;
const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
camera.position.x = -0.01;
camera.position.y = 2.3;
//camera.rotation.y += Math.PI / 2;
camera.position.z = 1.5;

var ChessModel;

const loadingManager = new THREE.LoadingManager();

const progressBar = document.getElementById('progress-bar');

loadingManager.onProgress = function(url, loaded, total) {
    progressBar.value = (loaded / total) * 100;
};

const progressBarContainer = document.querySelector('.progress-bar-container');
loadingManager.onLoad = function() {
    progressBarContainer.style.display = 'none';
}

const loader = new GLTFLoader(loadingManager);
loader.load("texturebakedchess.glb", function(gltf) {
    ChessModel = gltf.scene;
    ChessModel.position.set(0, 0.5, 0)
    ChessModel.scale.set(5, 5, 5);
    scene.add(ChessModel);
    scene.getObjectByName("Rays_glow").visible = false;
    //scene.getObjectByName("a1").material.color.setHex(0xff0000);
}, undefined, function (error) {
    console.error(error);
});


const rgbeloader = new HDRLoader(loadingManager);
rgbeloader.load("HDRIStarmap.hdr", function(texture) {
    texture.mapping = THREE.EquirectangularReflectionMapping;

    scene.environment = texture;
    scene.background = texture;
})


const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls( camera, renderer.domElement );
controls.target.set(0, 0.5, 0);
controls.update();
controls.enablePan = false;
controls.enableDamping = true;

const topview = document.getElementById("topview");
const toprenderer = new THREE.WebGLRenderer();
toprenderer.setSize(topview.offsetWidth, topview.offsetHeight);
topview.appendChild(toprenderer.domElement);
const topcam = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5);
topcam.aspect = topview.offsetWidth / topview.offsetHeight;
topcam.position.set(0, 2.2, 0);
topcam.lookAt(0, 0, 0);

const light = new THREE.DirectionalLight('white', 4);
light.position.set(10, 10, 10);
scene.add(light);

//Outlining
const composer = new EffectComposer(renderer)
const renderPass = new RenderPass(scene, camera);

composer.addPass(renderPass);

const outline = new OutlinePass(new THREE.Vector2(window.innerWidth, window.InnerHeight), scene, camera);
outline.edgeThickness = 1.0;
outline.edgeStrength = 3.9;
outline.visibleEdgeColor.set(0x6004e0);

composer.addPass(outline);

const fxaaShader = new ShaderPass(FXAAShader);
fxaaShader.uniforms["resolution"].value.set(1 / window.innerWidth, 1 / window.innerHeight);
composer.addPass(fxaaShader);



function animate() {
    controls.update;
    renderer.physicallyCorrectLights = true;
    renderer.render(scene, camera);
    composer.render(scene, camera);
};

renderer.setAnimationLoop(animate);

topcam.updateProjectionMatrix();
function animatetop() {
    toprenderer.render(scene, topcam);
};

toprenderer.setAnimationLoop(animatetop);

window.addEventListener('resize', function() {
    camera.aspect = this.window.innerWidth / this.window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(this.window.innerWidth, this.window.innerHeight);

    topcam.aspect = topview.offsetWidth / topview.offsetHeight;
    topcam.updateProjectionMatrix();
    toprenderer.setSize(topview.offsetWidth, topview.offsetHeight);
});

/**
 * Raycasting for picking & piece movement
 */

var myTurn = true; //For testing only, change to myTurn from cli.js later

var selectedPiece = undefined;

var lastMove = undefined;

//const socket = //clis js socket

//ADD BACK IN AFTER TESTING
/*
socket.on("state_update", function() {
    lastMove = undefined;
    takeTurn();
})*/

//Remove: for testing only!!
document.addEventListener('keydown', function(event) {
    if (event.key == "t") {
        console.log("!");
        takeTurn();
    }
});
document.addEventListener('keydown', function(event) {
    if (event.key == "q") {
        console.log("-");
        myTurn = false;
    }
});

document.addEventListener('keydown', function(event) {
    if (event.key == "y") {
        console.log("-");
        myTurn = true;
    }
});

function takeTurn() {
    if (myTurn) {
        document.querySelector(".opponents-turn-text").style.display = 'none';
        document.addEventListener('click', selectPiece, {once: true});
    }
    else {
        document.querySelector(".opponents-turn-text").style.display = 'inline';
    }
};

function selectPiece(event) {
    selectedPiece = getPickedObject(event);
    if (!selectedPiece || selectedPiece.name.includes("Frame") || selectedPiece.name.includes("Bottom") || !selectedPiece.name.includes("_")) {//selected object is not a piece
        console.log("keep waiting for pick!");
        document.addEventListener('click', selectPiece, {once: true});
    }
    else {
        highlightObject(selectedPiece);
        document.addEventListener('click', selectSquare, {once: true});
    }
};

function selectSquare(event) {
    const selectedSquare = getPickedObject(event);
    if (!selectedSquare || selectedSquare.name.length != 2) { //All squares are named with 2 characters
        //Did not choose square
        console.log("pick again!");
        document.addEventListener('click', selectSquare, {once: true});
    }
    else {
        unHighlightObject(selectedPiece);
        movePiece(selectedSquare);
        selectedPiece = undefined;
    }
};

function movePiece(targetSquare) {
    const selectedPieceName = selectedPiece.name;

    //Create raycaster under piece to get current square
    const raycaster = new THREE.Raycaster();
    const origin = new THREE.Vector3();
    selectedPiece.getWorldPosition(origin);
    const direction = new THREE.Vector3(0, -1, 0);
    raycaster.set(origin, direction);
    const intersectedObjects = raycaster.intersectObjects(scene.children);
    var currentSquare;
    for (var obj = 0; obj < intersectedObjects.length; obj++) {
        if (intersectedObjects[obj].object.name.length == 2) {
            currentSquare = intersectedObjects[obj].object; //Intersected object with 2-character name is the square below the current piece
        }
    }

    /*if (selectedPiece.name.includes("Pawn"))
    {*/
        movePawn(currentSquare, targetSquare);
    /*}
    else if (selectedPiece.name.includes("Knight"))
    {
        moveKnight(currentSquare, targetSquare);
    }
    else if (selectedPiece.name.includes("Bishop"))
    {
        moveBishop(currentSquare, targetSquare);
    }
    else if (selectedPiece.name.includes("Rook"))
    {
        moveRook(currentSquare, targetSquare);
    }
    else if (selectedPiece.name.includes("Queen"))
    {
        moveQueen(currentSquare, targetSquare);
    }
    else if (selectedPiece.name.includes("King"))
    {
        moveKing(currentSquare, targetSquare);
    }*/

    lastMove = "";
    lastMove += currentSquare.name;
    lastMove += targetSquare.name;
    if (selectedPiece.name.includes("Pawn") && ((Math.abs(parseInt(selectedPiece.name[selectedPiece.name.length - 1]) - parseInt(targetSquare.name[1])) == 6))) { //if difference in square name indicates pawn promotion
        console.log("Pawn promoted!");
        lastMove += "q";
    }
    console.log("last move in UCI:", lastMove);
};

var singleSquareDistance = 0.05;

function movePawn(currentSquare, targetSquare) {
    const currentrow = currentSquare.name[0];
    const currentcol = currentSquare.name[1];
    const targetrow = targetSquare.name[0];
    const targetcol = targetSquare.name[1];
    var rowdifference = targetrow.charCodeAt(0) - currentrow.charCodeAt(0);
    var coldifference = targetcol - currentcol;
    selectedPiece.position.x += (rowdifference * singleSquareDistance);
    selectedPiece.position.z -= (coldifference * singleSquareDistance);
    const pieceOnTargetSquare = getPieceOnSquare(targetSquare);
    if (pieceOnTargetSquare) {
        console.log(pieceOnTargetSquare.name);
        pieceOnTargetSquare.parent.remove(pieceOnTargetSquare);
    }
};

function getPieceOnSquare(square) {
    //Use raycaster to determine piece above square
    square.updateMatrixWorld(true);
    const upraycaster = new THREE.Raycaster();
    const origin = new THREE.Vector3();
    square.getWorldPosition(origin);
    const direction = new THREE.Vector3(0, 1, 0);
    console.log("square:", square, "square position:", square.position);
    console.log("origin:", origin);
    console.log("direction:", direction);
    upraycaster.set(origin, direction);
    //showRayLine(upraycaster);
    const intersectedObjects = upraycaster.intersectObjects(scene.children);
    for (var obj = 0; obj < intersectedObjects.length; obj++) {
        if (intersectedObjects[obj].object.name.length > 2) {
            console.log("found pice: ", intersectedObjects[obj].object.name);
            return intersectedObjects[obj].object; //Intersected object with long name is the piece
        }
    }
    console.log("No piece there");
    return undefined;
};

function getPickedObject(event) {
    const raycaster = new THREE.Raycaster();
    var mousePosition = new THREE.Vector2();
    var pickedObject;
    mousePosition.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(mousePosition, camera);
    const intersectedObjects = raycaster.intersectObjects(scene.children);
    if (intersectedObjects[0]) {
        pickedObject = intersectedObjects[0].object;
    }
    console.log(pickedObject);
    return pickedObject;
};

function highlightObject(object) {

    outline.selectedObjects = [object];
    console.log(outline.selectedObjects)
    /*
    const overlayGeometry = object.geometry.clone();
    const overlayMaterial = new THREE.MeshBasicMaterial({
        color: 0x0000ff,
    });
    const overlayMesh = new THREE.Mesh(overlayGeometry, overlayMaterial);

    overlayMesh.position.copy(object.position);
    overlayMesh.position.y += 2;
    overlayMesh.rotation.copy(object.rotation);
    overlayMesh.scale.copy(object.scale);
    overlayMesh.name = "overlaymesh";

    ChessModel.getObjectByName("Scene").add(overlayMesh);
    console.log(scene.getObjectByName("overlaymesh"));
    console.log(overlayMesh.position);
    console.log(object.position);
    console.log("added highlight!");
    console.log(ChessModel.children);
    console.log(overlayMesh.geometry.boundingBox);
    */
};

function unHighlightObject(object) {
    outline.selectedObjects.pop();
}

//Debugging function that shows the raycaster ray
function showRayLine(raycaster) {
    const rayvisual = new THREE.ArrowHelper(raycaster.direction, raycaster.origin, 100, 0xff0000);
    scene.add(rayvisual);
};

