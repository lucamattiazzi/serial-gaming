import botArtwork from '../assets/bot.svg'

// Piccole illustrazioni dei tabelloni: restano nitide anche su tablet.
export function BotDrawing() {
  return <img src={botArtwork} alt="" aria-hidden="true" />
}

export default function GameArtwork({ game }) {
  let drawing
  switch (game.id) {
    case 'tictactoe':
      drawing = <g transform="translate(106 18) rotate(-8 74 58)">
        <rect width="148" height="116" rx="18" fill="#fff" stroke="#b8cbef" strokeWidth="2" />
        <path d="M50 12v92m48-92v92M12 39h124M12 77h124" stroke="#dbe5f8" strokeWidth="3" />
        <path d="m20 14 19 18m0-18L20 32m47 53 18 18m0-18-18 18m32-70 18 18m0-18-18 18" stroke="#5789e2" strokeWidth="6" strokeLinecap="round" />
        <circle cx="74" cy="57" r="12" stroke="#f1a445" strokeWidth="6" fill="none" />
        <circle cx="25" cy="95" r="12" stroke="#f1a445" strokeWidth="6" fill="none" />
      </g>
      break
    case 'forza4':
      drawing = <g transform="translate(91 14) rotate(5 90 62)">
        <rect width="178" height="124" rx="15" fill="#648be3" />
        {Array.from({ length: 24 }, (_, i) => <circle key={i} cx={19 + i % 6 * 28} cy={20 + Math.floor(i / 6) * 28} r="10" fill={i < 9 ? '#dbe6fd' : i % 3 === 0 ? '#ffca61' : '#fc897d'} />)}
      </g>
      break
    case 'morra':
      drawing = <>
        <circle cx="105" cy="71" r="37" fill="#fff" /><circle cx="181" cy="84" r="37" fill="#ffce75" /><circle cx="250" cy="59" r="37" fill="#fff" />
        <g fontSize="40" textAnchor="middle" fill="#795222"><text x="105" y="86">✊</text><text x="181" y="99">✋</text><text x="250" y="74">✌️</text></g>
      </>
      break
    case 'navale':
      drawing = <g transform="translate(95 10)">
        <path d="M0 33h170M0 63h170M0 93h170M25 5v115M65 5v115M105 5v115M145 5v115" stroke="#abd8ec" strokeWidth="2" />
        <path d="m31 73 22 25h80l21-25Z" fill="#6589bc" /><path d="M85 10v62H43Z" fill="#fff" /><path d="M91 25v47h43Z" fill="#ffc768" />
        <path d="M5 110q12-9 25 0t25 0t25 0t25 0t25 0t25 0" fill="none" stroke="#4d9fc0" strokeWidth="4" strokeLinecap="round" />
      </g>
      break
    case 'arena':
      drawing = <>
        <ellipse cx="180" cy="127" rx="106" ry="10" fill="#c9b9ed" />
        <path d="m91 62 7-29 22 19 31-12-1 28q15 58-27 59-45-1-32-65" fill="#f5b275" />
        <path d="m145 64 20-34 16 12 22-10 7 39q12 49-35 52-38-5-30-59" fill="#ba9ae6" />
        <path d="m211 67 12-25 16 14 23-12 5 35q9 41-28 45-39-4-28-57" fill="#7ec6b7" />
        {[119, 177, 240].map(x => <g key={x} fill="#463953"><circle cx={x - 9} cy="83" r="4" /><circle cx={x + 9} cy="83" r="4" /><path d={`M${x - 5} 97q5 5 10 0`} stroke="#463953" strokeWidth="2" fill="none" /></g>)}
      </>
      break
    case 'othello':
      drawing = <g transform="translate(108 13) rotate(-5 73 63)">
        <rect width="144" height="126" rx="14" fill="#78bda1" />
        <path d="M36 0v126m36-126v126m36-126v126M0 32h144M0 63h144M0 94h144" stroke="#5aa285" strokeWidth="2" />
        {[[54, 48], [90, 79], [18, 110]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="13" fill="#3d4b61" />)}
        {[[90, 48], [54, 79], [126, 110]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="13" fill="#fff" />)}
      </g>
      break
    default:
      drawing = <text x="180" y="100" fontSize="70" textAnchor="middle">{game.icon}</text>
  }
  return <svg viewBox="0 0 360 150" fill="none" aria-hidden="true">{drawing}</svg>
}
