import * as THREE from 'three';
        import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
        import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
        import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'; // Инструмент для клонирования 3D моделей

        const MODEL_SCALE = 0.25; 
        
        let level = 1;
        const maxLevel = 3;
        let bagsTotal = 0;
        let bagsCollected = 0;
        
        let maxStamina = 100;
        let stamina = maxStamina;
        let isExhausted = false;

        let isMuted = false;
        const bgmAudio = new Audio('audio/bgm.mp3');
        bgmAudio.loop = true;
        bgmAudio.volume = 0.4; 

        const stepAudio = new Audio('audio/step.mp3');
        stepAudio.volume = 0.8;
        let lastStepTime = 0;
        
        const btnMute = document.getElementById('btn-mute');
        
        function toggleMute() {
            isMuted = !isMuted;
            bgmAudio.muted = isMuted;
            stepAudio.muted = isMuted;
            isMuted ? btnMute.classList.add('muted') : btnMute.classList.remove('muted');
        }
        btnMute.addEventListener('click', toggleMute);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x050505);
        scene.fog = new THREE.Fog(0x050505, 2, 20);

        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);

        const controls = new PointerLockControls(camera, document.body);
        const moveState = { forward: false, backward: false, left: false, right: false, run: false };
        const velocity = new THREE.Vector3();
        const direction = new THREE.Vector3();

        let map = [];
        let sceneObjects = [];
        let bags = [];
        let killers = []; // Теперь это МАССИВ призраков
        let elevator;
        let mapSize = 0;
        let isGameOver = false;

        const uiMenu = document.getElementById('menu');
        const uiHud = document.getElementById('hud');
        const uiCrosshair = document.getElementById('crosshair');
        const uiBags = document.getElementById('ui-bags');
        const uiLevel = document.getElementById('ui-level');
        const btnStart = document.getElementById('btn-start');
        const uiStaminaContainer = document.getElementById('stamina-container');
        const uiStaminaBar = document.getElementById('stamina-bar');

        btnStart.addEventListener('click', () => {
            controls.lock();
            if(bgmAudio.paused && !isMuted) bgmAudio.play().catch(e => console.log("Аудио заблокировано", e));
        });

        controls.addEventListener('lock', () => {
            uiMenu.classList.add('hidden');
            uiHud.classList.remove('hidden');
            uiCrosshair.classList.remove('hidden');
            uiStaminaContainer.classList.remove('hidden');
            if (isGameOver) initLevel(1);
        });
        
        controls.addEventListener('unlock', () => {
            if (!isGameOver) uiMenu.classList.remove('hidden');
        });

        document.addEventListener('keydown', (e) => {
            switch(e.code) {
                case 'ArrowUp': case 'KeyW': moveState.forward = true; break;
                case 'ArrowLeft': case 'KeyA': moveState.left = true; break;
                case 'ArrowDown': case 'KeyS': moveState.backward = true; break;
                case 'ArrowRight': case 'KeyD': moveState.right = true; break;
                case 'ShiftLeft': moveState.run = true; break;
                case 'KeyM': toggleMute(); break;
            }
        });
        document.addEventListener('keyup', (e) => {
            switch(e.code) {
                case 'ArrowUp': case 'KeyW': moveState.forward = false; break;
                case 'ArrowLeft': case 'KeyA': moveState.left = false; break;
                case 'ArrowDown': case 'KeyS': moveState.backward = false; break;
                case 'ArrowRight': case 'KeyD': moveState.right = false; break;
                case 'ShiftLeft': moveState.run = false; break;
            }
        });

        const textureLoader = new THREE.TextureLoader();
        function applyTile(texture, repeatX, repeatY) {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(repeatX, repeatY);
        }

        const wallTex = textureLoader.load('textures/wall.jpg');
        const floorTex = textureLoader.load('textures/floor.jpg');
        const ceilTex = textureLoader.load('textures/ceiling.jpg'); 
        const bagTex = textureLoader.load('textures/bag.jpg');

        applyTile(wallTex, 1, 1); 
        applyTile(bagTex, 1, 1);

        const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.8 });
        const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 });
        const ceilMat = new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 1.0 }); 
        const bagMat = new THREE.MeshStandardMaterial({ map: bagTex });
        
        const killerMat = new THREE.MeshBasicMaterial({ color: 0xff0000 }); 
        const elevatorMat = new THREE.MeshBasicMaterial({ color: 0x0088ff, transparent: true, opacity: 0.6 });

        const gltfLoader = new GLTFLoader();
        let loadedGhostModelBase = null;

        gltfLoader.load(
            'models/ghost.glb', 
            (gltf) => {
                const model = gltf.scene;
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.frustumCulled = false; 
                        if (child.material) {
                            child.material.emissive = new THREE.Color(0x330000);
                            child.material.emissiveIntensity = 0.5;
                        }
                    }
                });

                model.scale.set(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);

                loadedGhostModelBase = new THREE.Group();
                loadedGhostModelBase.add(model);
                
                const ghostLight = new THREE.PointLight(0xff0000, 3, 10);
                ghostLight.position.y = 1.5;
                loadedGhostModelBase.add(ghostLight);

                // Если модель загрузилась во время игры - обновляем всех призраков
                killers.forEach(k => {
                    k.clear();
                    k.add(SkeletonUtils.clone(loadedGhostModelBase)); 
                });
            },
            undefined,
            (error) => console.error('Не удалось загрузить модель призрака:', error)
        );

        const light = new THREE.PointLight(0xffffff, 1.2, 25);
        scene.add(light);
        const ambientLight = new THREE.AmbientLight(0x222222);
        scene.add(ambientLight);

        function initLevel(lvl) {
            level = lvl;
            isGameOver = false;
            bagsCollected = 0;
            uiLevel.innerText = level;
            
            // Урезаем стамину с каждым уровнем (Ур.1: 100, Ур.2: 70, Ур.3: 40)
            maxStamina = 100 - (level - 1) * 30;
            stamina = maxStamina;
            isExhausted = false;
            
            // Визуально сужаем полоску стамины, чтобы игрок видел урезание
            uiStaminaContainer.style.width = `${maxStamina * 3}px`;
            uiStaminaBar.classList.remove('exhausted');
            
            sceneObjects.forEach(obj => scene.remove(obj));
            bags.forEach(b => scene.remove(b));
            killers.forEach(k => scene.remove(k)); // Удаляем старых призраков
            
            sceneObjects = []; bags = []; killers = [];
            
            mapSize = 13 + (level * 4); 
            bagsTotal = 3 + (level * 2); 
            uiBags.innerText = `${bagsCollected}/${bagsTotal}`;
            
            const floorRepeat = mapSize / 2;
            applyTile(floorTex, floorRepeat, floorRepeat);
            applyTile(ceilTex, floorRepeat, floorRepeat); 
            
            generateMap();
            spawnObjects();
            
            camera.position.set(4.5, 1.5, 4.5);
            camera.lookAt(10, 1.5, 10);
        }

        function generateMap() {
            map = [];
            const cellSize = 3;
            for(let i=0; i<mapSize; i++) {
                map[i] = [];
                for(let j=0; j<mapSize; j++) { map[i][j] = 1; }
            }

            function carve(x, z) {
                map[x][z] = 0;
                const dirs = [[0, -2], [0, 2], [-2, 0], [2, 0]].sort(() => Math.random() - 0.5);
                for (let [dx, dz] of dirs) {
                    let nx = x + dx, nz = z + dz;
                    if (nx > 0 && nx < mapSize-1 && nz > 0 && nz < mapSize-1 && map[nx][nz] === 1) {
                        map[x + dx/2][z + dz/2] = 0; 
                        carve(nx, nz);
                    }
                }
            }
            carve(1, 1);

            for(let i=1; i<mapSize-1; i++) {
                for(let j=1; j<mapSize-1; j++) {
                    if(map[i][j] === 1 && Math.random() < 0.15) { map[i][j] = 0; }
                }
            }

            const floorGeo = new THREE.PlaneGeometry(mapSize * cellSize, mapSize * cellSize);
            const floor = new THREE.Mesh(floorGeo, floorMat);
            floor.rotation.x = -Math.PI / 2;
            floor.position.set(mapSize * cellSize / 2, 0, mapSize * cellSize / 2);
            scene.add(floor); sceneObjects.push(floor);

            const ceil = new THREE.Mesh(floorGeo, ceilMat);
            ceil.position.set(mapSize * cellSize / 2, 3, mapSize * cellSize / 2);
            ceil.rotation.x = Math.PI / 2;
            scene.add(ceil); sceneObjects.push(ceil);

            const wallGeo = new THREE.BoxGeometry(cellSize, 3, cellSize);
            for(let i=0; i<mapSize; i++) {
                for(let j=0; j<mapSize; j++) {
                    if(map[i][j] === 1) {
                        const wall = new THREE.Mesh(wallGeo, wallMat);
                        wall.position.set(i * cellSize + cellSize/2, 1.5, j * cellSize + cellSize/2);
                        scene.add(wall); sceneObjects.push(wall);
                    }
                }
            }
        }

        function spawnObjects() {
            const cellSize = 3;
            const emptyCells = [];
            for(let i=3; i<mapSize-2; i++) {
                for(let j=3; j<mapSize-2; j++) {
                    if(map[i][j] === 0) emptyCells.push({x: i, z: j});
                }
            }
            emptyCells.sort(() => Math.random() - 0.5);

            const bagGeo = new THREE.BoxGeometry(0.6, 0.8, 0.4);
            for(let i=0; i<bagsTotal; i++) {
                const cell = emptyCells.pop();
                const bag = new THREE.Mesh(bagGeo, bagMat);
                bag.position.set(cell.x * cellSize + 1.5, 0.4, cell.z * cellSize + 1.5);
                scene.add(bag); bags.push(bag);
            }

            const elevCell = emptyCells.pop();
            const elevGeo = new THREE.BoxGeometry(2, 3, 2);
            elevator = new THREE.Mesh(elevGeo, elevatorMat);
            elevator.position.set(elevCell.x * cellSize + 1.5, 1.5, elevCell.z * cellSize + 1.5);
            elevator.visible = false;
            scene.add(elevator);

            // Находим самые дальние точки лабиринта для спавна орды
            let distantCells = emptyCells.map(c => {
                return { x: c.x, z: c.z, dist: Math.abs(c.x - 1) + Math.abs(c.z - 1) };
            }).sort((a, b) => b.dist - a.dist);

            // Спавним количество призраков, равное уровню игры (1 уровень = 1, 2 = 2 и т.д.)
            for(let k = 0; k < level; k++) {
                if(!distantCells[k]) break; // Защита от ошибок генерации
                
                let spawnCell = distantCells[k];
                let killer = new THREE.Group();
                killer.position.set(spawnCell.x * cellSize + 1.5, 1.5, spawnCell.z * cellSize + 1.5);
                
                if (loadedGhostModelBase) {
                    killer.add(SkeletonUtils.clone(loadedGhostModelBase));
                } else {
                    const killerGeo = new THREE.SphereGeometry(0.8, 16, 16);
                    const fallbackMesh = new THREE.Mesh(killerGeo, killerMat);
                    killer.add(fallbackMesh);
                }
                
                scene.add(killer);
                killers.push(killer); // Добавляем в массив врагов
            }
        }

        function checkCollision(pos) {
            const cellSize = 3; const radius = 0.4; 
            const points = [
                { x: pos.x - radius, z: pos.z - radius }, { x: pos.x + radius, z: pos.z - radius },
                { x: pos.x - radius, z: pos.z + radius }, { x: pos.x + radius, z: pos.z + radius }
            ];
            for(let p of points) {
                const gridX = Math.floor(p.x / cellSize); const gridZ = Math.floor(p.z / cellSize);
                if(map[gridX] && map[gridX][gridZ] === 1) return true;
            }
            return false;
        }

        function getPathToPlayer(killerRef) {
            let kGridX = Math.floor(killerRef.position.x / 3); let kGridZ = Math.floor(killerRef.position.z / 3);
            let pGridX = Math.floor(camera.position.x / 3); let pGridZ = Math.floor(camera.position.z / 3);

            if (kGridX === pGridX && kGridZ === pGridZ) return { x: pGridX, z: pGridZ, exact: true };

            let queue = [{x: kGridX, z: kGridZ, path: []}];
            let visited = new Set(); visited.add(`${kGridX},${kGridZ}`);

            while(queue.length > 0) {
                let curr = queue.shift();
                if (curr.x === pGridX && curr.z === pGridZ) return curr.path[0];

                const dirs = [[0,-1], [0,1], [-1,0], [1,0]];
                for(let d of dirs) {
                    let nx = curr.x + d[0], nz = curr.z + d[1];
                    if (nx > 0 && nx < mapSize-1 && nz > 0 && nz < mapSize-1 && map[nx][nz] === 0) {
                        let key = `${nx},${nz}`;
                        if (!visited.has(key)) {
                            visited.add(key);
                            queue.push({x: nx, z: nz, path: [...curr.path, {x: nx, z: nz}]});
                        }
                    }
                }
            }
            return null;
        }

        function endGame(victory) {
            isGameOver = true;
            controls.unlock();
            uiHud.classList.add('hidden');
            uiCrosshair.classList.add('hidden');
            uiStaminaContainer.classList.add('hidden');
            uiMenu.classList.remove('hidden');
            
            if(victory) {
                menuTitle.innerText = "ВЫ ПРОШЛИ ИГРУ!"; menuTitle.style.color = "#00ff00";
                btnStart.innerText = "Играть снова";
            } else {
                menuTitle.innerText = "ВАС ПОЙМАЛИ!"; menuTitle.style.color = "#ff0000";
                btnStart.innerText = "Начать заново";
            }
        }

        const clock = new THREE.Clock();

        function animate() {
            requestAnimationFrame(animate);

            if (controls.isLocked === true && !isGameOver) {
                const delta = clock.getDelta();
                const now = clock.elapsedTime;

                light.position.copy(camera.position);

                velocity.x -= velocity.x * 10.0 * delta;
                velocity.z -= velocity.z * 10.0 * delta;

                direction.z = Number(moveState.forward) - Number(moveState.backward);
                direction.x = Number(moveState.right) - Number(moveState.left);
                direction.normalize(); 
                
                const isMoving = moveState.forward || moveState.backward || moveState.left || moveState.right;
                
                if (isMoving && !isMuted) {
                    const stepInterval = (moveState.run && !isExhausted) ? 0.35 : 0.55;
                    if (now - lastStepTime > stepInterval) {
                        stepAudio.currentTime = 0; 
                        stepAudio.play().catch(e => console.log(e));
                        lastStepTime = now;
                    }
                }

                if (moveState.run && !isExhausted && isMoving) {
                    stamina -= 25 * delta; 
                    if (stamina <= 0) {
                        stamina = 0; isExhausted = true;
                        uiStaminaBar.classList.add('exhausted'); 
                    }
                } else {
                    stamina += 15 * delta; 
                    if (stamina >= maxStamina) stamina = maxStamina;
                    
                    // Одышка спадает, когда накопили 30% от текущего максимума
                    if (isExhausted && stamina > (maxStamina * 0.3)) {
                        isExhausted = false; uiStaminaBar.classList.remove('exhausted'); 
                    }
                }
                
                // Бар заполняется относительно ТЕКУЩЕГО максимума
                uiStaminaBar.style.width = `${(stamina / maxStamina) * 100}%`;

                let speedMult = (moveState.run && !isExhausted) ? 45.0 : 24.0;

                if (moveState.forward || moveState.backward) velocity.z -= direction.z * speedMult * delta;
                if (moveState.left || moveState.right) velocity.x -= direction.x * speedMult * delta;

                const oldPos = camera.position.clone();
                controls.moveRight(-velocity.x * delta);
                controls.moveForward(-velocity.z * delta);

                if(checkCollision(camera.position)) camera.position.copy(oldPos); 

                for(let i = bags.length - 1; i >= 0; i--) {
                    bags[i].rotation.y += 2 * delta; 
                    if(camera.position.distanceTo(bags[i].position) < 1.5) {
                        scene.remove(bags[i]); bags.splice(i, 1);
                        bagsCollected++; uiBags.innerText = `${bagsCollected}/${bagsTotal}`;
                        if(bagsCollected === bagsTotal) elevator.visible = true; 
                    }
                }

                // Логика перемещения МАССИВА призраков
                killers.forEach((killer, index) => {
                    // Смещение расчета пути, чтобы не перегружать процессор, если призраков много
                    if (!killer.lastCalc || now - killer.lastCalc > 0.2) {
                        killer.targetCell = getPathToPlayer(killer);
                        killer.lastCalc = now + (index * 0.05); 
                    }

                    if (killer.targetCell) {
                        let targetX, targetZ;
                        if (killer.targetCell.exact) {
                            targetX = camera.position.x; targetZ = camera.position.z;
                        } else {
                            targetX = killer.targetCell.x * 3 + 1.5; targetZ = killer.targetCell.z * 3 + 1.5;
                        }

                        let dirToPlayer = new THREE.Vector3(targetX - killer.position.x, 0, targetZ - killer.position.z);
                        if (dirToPlayer.length() > 0.1) {
                            dirToPlayer.normalize();
                            // Идеальная фиксированная скорость: быстрее ходьбы, но медленнее бега
                            const killerSpeed = 2.6 * delta; 
                            killer.position.add(dirToPlayer.multiplyScalar(killerSpeed));
                        }
                    }
                    
                    killer.lookAt(camera.position.x, killer.position.y, camera.position.z);
                    killer.position.y = 1.5 + Math.sin(now * 5 + index) * 0.2; 

                    if(camera.position.distanceTo(killer.position) < 1.2) endGame(false);
                });

                if(bagsCollected === bagsTotal && camera.position.distanceTo(elevator.position) < 2) {
                    if(level < maxLevel) initLevel(level + 1);
                    else endGame(true);
                }
            } else {
                clock.getDelta(); 
            }

            renderer.render(scene, camera);
        }

        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        initLevel(1);
        animate();