const AboutIllustration = () => {
  return (
    <div class="w-full max-w-md mx-auto">
      <svg width="100%" viewBox="0 0 680 480" xmlns="http://www.w3.org/2000/svg" role="img">
        <title>Illustration of a person building tools at a desk</title>
        <defs>
          <clipPath id="bgclip"><rect x="60" y="40" width="560" height="400" rx="24" /></clipPath>
        </defs>

        <rect class="bg" x="60" y="40" width="560" height="400" rx="24" />

        <g clip-path="url(#bgclip)">
          <ellipse class="bulbglow anim-bulb-glow" cx="150" cy="100" r="46" />
          <circle class="star anim-star-1" cx="560" cy="90" r="4" />
          <circle class="star anim-star-2" cx="580" cy="130" r="3" />
          <circle class="star anim-star-3" cx="120" cy="380" r="4" />
          <circle class="star anim-star-4" cx="600" cy="380" r="3.5" />

          <rect class="desk" x="140" y="330" width="400" height="24" rx="6" />
          <rect class="deskdark" x="140" y="348" width="400" height="10" rx="4" />
          <rect class="deskdark" x="170" y="358" width="18" height="60" rx="3" />
          <rect class="deskdark" x="492" y="358" width="18" height="60" rx="3" />

          <path class="shirt" d="M270 330 C270 270 300 250 340 250 C380 250 410 270 410 330 Z" />
          <circle class="skin" cx="340" cy="215" r="38" />
          <path class="hair" d="M302 205 C300 175 320 158 340 158 C360 158 380 175 378 205 C378 190 365 178 340 178 C315 178 302 190 302 205 Z" />
          <circle cx="327" cy="215" r="3" fill="#11111" />
          <circle cx="353" cy="215" r="3" fill="#11111" />
          <path d="M330 230 Q340 236 350 230" stroke="#B8825F" stroke-width="2" fill="none" stroke-linecap="round" />

          <rect class="laptop" x="280" y="300" width="120" height="8" rx="2" />
          <path class="laptop" d="M295 240 L385 240 L385 300 L295 300 Z" />
          <rect class="laptopscreen" x="303" y="248" width="74" height="44" rx="2" />
          <rect class="paperline" x="311" y="258" width="40" height="4" rx="2" />
          <rect class="paperline" x="311" y="268" width="55" height="4" rx="2" />
          <rect class="paperline" x="311" y="278" width="30" height="4" rx="2" />

          <path class="mug" d="M432 310 L468 310 L465 340 Q450 346 435 340 Z" />
          <path d="M468 316 Q480 316 480 326 Q480 336 468 334" stroke="#D96C5C" stroke-width="4" fill="none" />
          <g opacity="0.7">
            <path class="steam-wisp anim-steam-1" d="M438 302 Q434 292 438 284 Q442 276 438 268" 
              stroke="#C89F7B" stroke-width="2.5" stroke-linecap="round" fill="none" />
            <path class="steam-wisp anim-steam-2" d="M450 302 Q446 290 450 280 Q454 270 450 260" 
              stroke="#A67C52" stroke-width="2.5" stroke-linecap="round" fill="none" />
            <path class="steam-wisp anim-steam-3" d="M462 302 Q458 292 462 284 Q466 276 462 268" 
              stroke="#E3D5C2" stroke-width="2.5" stroke-linecap="round" fill="none" />
          </g>

          <g class="anim-plant" transform="translate(200 300)">
            <rect class="plantpot" x="-14" y="20" width="28" height="24" rx="4" />
            <path class="plant" d="M0 20 C-18 20 -20 -4 -6 -6 C-10 6 -2 16 0 20 Z" />
            <path class="plant" d="M0 20 C18 20 20 -8 6 -10 C10 4 2 16 0 20 Z" />
            <path class="plant" d="M0 20 C0 20 0 -14 0 -14 C4 0 4 12 0 20 Z" />
          </g>

          {/* <g transform="translate(150 100)">
            <circle class="bulb" cx="0" cy="0" r="22" />
            <path
              class="anim-bulb-rays"
              d="M-30 0 L-42 0 M30 0 L42 0 M-21 -21 L-30 -30 M21 -21 L30 -30"
              stroke="#F0C24B" stroke-width="3" stroke-linecap="round"
            />
          </g> */}

          <g transform="translate(150 100)">
            <circle class="bulb anim-bulb-core" cx="0" cy="0" r="22" />
            <g class="anim-ray-spin">
              <path class="anim-ray ray-1" d="M-30 0 L-42 0" stroke="#C58B39" stroke-width="3" stroke-linecap="round" />
              <path class="anim-ray ray-2" d="M30 0 L42 0" stroke="#C58B39" stroke-width="3" stroke-linecap="round" />
              <path class="anim-ray ray-3" d="M-21 -21 L-30 -30" stroke="#C58B39" stroke-width="3" stroke-linecap="round" />
              <path class="anim-ray ray-4" d="M21 -21 L30 -30" stroke="#C58B39" stroke-width="3" stroke-linecap="round" />
              <path class="anim-ray ray-5" d="M0 -30 L0 -42" stroke="#C58B39" stroke-width="3" stroke-linecap="round" />
              <path class="anim-ray ray-6" d="M-21 21 L-30 30" stroke="#C58B39" stroke-width="3" stroke-linecap="round" />
              <path class="anim-ray ray-7" d="M21 21 L30 30" stroke="#C58B39" stroke-width="3" stroke-linecap="round" />
              <path class="anim-ray ray-8" d="M0 30 L0 42" stroke="#C58B39" stroke-width="3" stroke-linecap="round" />
            </g>
          </g>

          <g class="anim-gear" transform="translate(490 130)">
            <circle class="gear" cx="0" cy="0" r="20" />
            <circle class="bg" cx="0" cy="0" r="8" />
            <g fill="#6a3407ff">
              <rect x="-3" y="-28" width="6" height="10" rx="2" />
              <rect x="-3" y="18" width="6" height="10" rx="2" />
              <rect x="-28" y="-3" width="10" height="6" rx="2" />
              <rect x="18" y="-3" width="10" height="6" rx="2" />
            </g>
          </g>

          <g class="anim-paper" transform="translate(560 260) rotate(-8)">
            <rect class="paper" x="-22" y="-28" width="44" height="56" rx="4" />
            <rect class="paperline" x="-14" y="-14" width="28" height="4" rx="2" />
            <rect class="paperline" x="-14" y="-4" width="20" height="4" rx="2" />
            <rect class="paperline" x="-14" y="6" width="24" height="4" rx="2" />
          </g>
        </g>
      </svg>
    </div>
  )
}

export default AboutIllustration