import { Application, Assets, Point, MeshRope, Graphics, Sprite, BlurFilter } from 'pixi.js';

(async () => {
    // 1. 애플리케이션 초기화 (픽셀 밀도 및 품질 최적화)
    const app = new Application();
    await app.init({ 
        resizeTo: window, 
        backgroundColor: 0x000000,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true
    });
    document.body.appendChild(app.canvas);

    // 2. 에셋 일괄 로드 (호스팅 환경을 위해 절대 경로 / 로 수정)
    const textures = await Assets.load([
        { alias: 'bg', src: '/bg.png' },
        { alias: 'arm', src: '/arm.png' },
        { alias: 'hand', src: '/hand.png' }
    ]);

    // [설정값 및 기능 상수]
    const FIXED_BG_X = 1585; 
    const FIXED_BG_Y = 2845;
    const MAX_PARALLAX = 25;
    const MAX_ARM_MOVE = 200;
    const MAX_HAND_MOVE = 100;
    const ARM_OFFSET_X = 620;
    const HAND_OFFSET_X = 150;
    const HAND_OFFSET_Y = 50;
    const HAND_SCALE = 2;

    const SHOW_DEBUG_POINTS = false;

    /**
     * 초점별 블러 설정 상수
     */
    const FOCUS_CONFIG = {
        BG:   { min: 0,  max: 20 },
        ARM:  { min: 5,  mid: 0, max: 10 },
        HAND: { min: 15, max: 0  }
    };

    // 3. 고품질 블러 필터 생성 함수
    const createHighQualityBlur = () => {
        const filter = new BlurFilter();
        filter.conserveMemory = false;
        filter.quality = 10;
        filter.resolution = window.devicePixelRatio || 1;
        return filter;
    };

    // 4. 레이어 구성
    const bg = new Sprite(textures.bg);
    bg.anchor.set(0.5);
    const bgBlurFilter = createHighQualityBlur();
    bg.filters = [bgBlurFilter];
    app.stage.addChild(bg);

    const armFixedPos = new Point(FIXED_BG_X - textures.bg.width / 2, FIXED_BG_Y - textures.bg.height / 2);
    const points = [
        new Point(armFixedPos.x, armFixedPos.y),
        new Point(armFixedPos.x + ARM_OFFSET_X, armFixedPos.y) 
    ];

    const rope = new MeshRope({ texture: textures.arm, points });
    const armBlurFilter = createHighQualityBlur();
    rope.filters = [armBlurFilter];
    app.stage.addChild(rope);

    const debugGraphics = new Graphics();
    app.stage.addChild(debugGraphics);

    const hand = new Sprite(textures.hand);
    hand.anchor.set(0.5);
    const handBlurFilter = createHighQualityBlur();
    hand.filters = [handBlurFilter];
    app.stage.addChild(hand);
    
    // 5. 초점(Focus) 상태 관리
    let targetFocus = 0.0;
    let currentFocus = 0.0;

    // 6. 리사이즈 대응 레이아웃
    const updateLayout = () => {
        const sw = app.screen.width;
        const sh = app.screen.height;

        const baseScale = Math.max(sw / textures.bg.width, sh / textures.bg.height);
        const safeScale = baseScale * 1.1; 

        bg.scale.set(safeScale);
        bg.position.set(sw / 2, sh / 2);

        rope.scale.set(safeScale);
        rope.position.set(sw / 2, sh / 2);

        hand.scale.set(safeScale * HAND_SCALE);
        
        const res = window.devicePixelRatio || 1;
        bgBlurFilter.resolution = res;
        armBlurFilter.resolution = res;
        handBlurFilter.resolution = res;
    };

    // 마우스 좌표 추적 (전역)
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;

    window.addEventListener('pointermove', (event) => {
        mouseX = event.clientX;
        mouseY = event.clientY;
    });

    // 7. 실시간 연산 및 렌더링 루프
    app.ticker.add(() => {
        const sw = window.innerWidth;
        const sh = window.innerHeight;

        const ratioX = (mouseX - sw / 2) / (sw / 2);
        const ratioY = (mouseY - sh / 2) / (sh / 2);

        // 초점 변경 조건: 화면 중심 기준 오른쪽 하단 영역(수학적 좌표 x,y 양수) 진입 시
        if (ratioX > 0 && ratioY > 0) {
            targetFocus = 1.0;
        } else {
            targetFocus = 0.0;
        }

        // 전역 화면 이동 (Parallax)
        const globalMoveX = ratioX * -MAX_PARALLAX;
        const globalMoveY = ratioY * -MAX_PARALLAX;
        app.stage.position.set(globalMoveX, globalMoveY);

        // 정점 및 객체 위치 연산
        const armBaseEndX = armFixedPos.x + ARM_OFFSET_X;
        points[1].x = armBaseEndX + (ratioX * MAX_ARM_MOVE);

        const armGlobalEndX = rope.x + points[1].x * rope.scale.x;
        const armGlobalEndY = rope.y + points[1].y * rope.scale.y;

        hand.x = armGlobalEndX + (ratioX * MAX_HAND_MOVE * rope.scale.x) - (HAND_OFFSET_X * rope.scale.x);
        hand.y = armGlobalEndY + (ratioY * MAX_HAND_MOVE * rope.scale.y) + (HAND_OFFSET_Y * rope.scale.y);

        // 초점 값 선형 보간 (Lerp)
        currentFocus += (targetFocus - currentFocus) * 0.1;

        // 초점 기반 블러 연동
        bgBlurFilter.blur = FOCUS_CONFIG.BG.min + (FOCUS_CONFIG.BG.max - FOCUS_CONFIG.BG.min) * currentFocus;
        handBlurFilter.blur = FOCUS_CONFIG.HAND.min + (FOCUS_CONFIG.HAND.max - FOCUS_CONFIG.HAND.min) * currentFocus;

        // ARM 3단계 보간
        if (currentFocus <= 0.5) {
            const t = currentFocus / 0.5;
            armBlurFilter.blur = FOCUS_CONFIG.ARM.min + (FOCUS_CONFIG.ARM.mid - FOCUS_CONFIG.ARM.min) * t;
        } else {
            const t = (currentFocus - 0.5) / 0.5;
            armBlurFilter.blur = FOCUS_CONFIG.ARM.mid + (FOCUS_CONFIG.ARM.max - FOCUS_CONFIG.ARM.mid) * t;
        }

        // 디버깅 UI
        debugGraphics.clear();
        if (SHOW_DEBUG_POINTS) {
            points.forEach((p, index) => {
                const globalX = rope.x + p.x * rope.scale.x;
                const globalY = rope.y + p.y * rope.scale.y;
                debugGraphics.circle(globalX, globalY, 8);
                debugGraphics.fill(index === 0 ? 0xff0000 : 0x00ff00);
                debugGraphics.stroke({ width: 2, color: 0xffffff });
            });
        }
    });

    updateLayout();
    window.addEventListener('resize', updateLayout);
})();