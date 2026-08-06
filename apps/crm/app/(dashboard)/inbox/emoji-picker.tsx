"use client";

import { useMemo, useState } from "react";

const EMOJI_GROUPS = [
  {
    id: "recentes",
    label: "Mais usados",
    icon: "🕘",
    emojis: "😀 😃 😄 😁 😂 🤣 😊 😍 🥰 😘 😉 🙏 ❤️ 👍 👏 🎉 🔥 ✅".split(" "),
  },
  {
    id: "rostos",
    label: "Rostos e pessoas",
    icon: "😀",
    emojis: "😀 😃 😄 😁 😆 😅 😂 🤣 🥲 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🫣 🤭 🫢 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫶 👐 🤲 🤝 🙏 💪".split(" "),
  },
  {
    id: "animais",
    label: "Animais e natureza",
    icon: "🐻",
    emojis: "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐻‍❄️ 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🪱 🐛 🦋 🐌 🐞 🐜 🪰 🪲 🪳 🕷️ 🦂 🐢 🐍 🦎 🐙 🦑 🦐 🦀 🐠 🐟 🐡 🐬 🐳 🦈 🐊 🐅 🐆 🦓 🦍 🦧 🐘 🦛 🦏 🐪 🦒 🦘 🦬 🐃 🐂 🐄 🐎 🐖 🐏 🦙 🐐 🦌 🐕 🐈 🐓 🦃 🦚 🦜 🦢 🦩 🕊️ 🐇 🦝 🦨 🦡 🌵 🎄 🌲 🌳 🌴 🌱 🌿 ☘️ 🍀 🎍 🪴 🎋 🍃 🍂 🍁 🌾 🌺 🌻 🌹 🌷 🌼 🌸 💐 🍄 🌎 🌞 🌙 ⭐ 🌈 🔥 💧".split(" "),
  },
  {
    id: "comidas",
    label: "Comidas e bebidas",
    icon: "🍔",
    emojis: "🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🥦 🥬 🥒 🌶️ 🫑 🌽 🥕 🫒 🧄 🧅 🥔 🍠 🥐 🥯 🍞 🥖 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🫓 🥪 🌮 🌯 🫔 🥙 🧆 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🦪 🍤 🍚 🍘 🍥 🥠 🥮 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🌰 🥜 🍯 🥛 ☕ 🫖 🍵 🧃 🥤 🧋 🍺 🍻 🥂 🍷 🍸 🍹 🧉 🧊".split(" "),
  },
  {
    id: "atividades",
    label: "Atividades",
    icon: "⚽",
    emojis: "⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🏒 🏑 🥍 🏏 🪃 🥅 ⛳ 🪁 🏹 🎣 🤿 🥊 🥋 🎽 🛹 🛼 🛷 ⛸️ 🥌 🎿 ⛷️ 🏂 🪂 🏋️ 🤼 🤸 ⛹️ 🤺 🤾 🏌️ 🏇 🧘 🏄 🏊 🤽 🚣 🧗 🚵 🚴 🏆 🥇 🥈 🥉 🏅 🎖️ 🎗️ 🎫 🎟️ 🎪 🤹 🎭 🩰 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🪗 🎸 🎻 🎲 ♟️ 🎯 🎳 🎮 🎰 🧩".split(" "),
  },
  {
    id: "viagens",
    label: "Viagens e lugares",
    icon: "🚗",
    emojis: "🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🏍️ 🛵 🚲 🛴 🚨 🚔 🚍 🚘 🚖 ✈️ 🛫 🛬 🛩️ 💺 🚁 🚀 🛸 🚉 🚆 🚄 🚅 🚈 🚂 🚇 🚊 🚝 🚞 🚋 ⛵ 🚤 🛥️ 🛳️ ⛴️ 🚢 ⚓ ⛽ 🚧 🚦 🗺️ 🗿 🗽 🗼 🏰 🏯 🏟️ 🎡 🎢 🎠 ⛲ ⛱️ 🏖️ 🏝️ 🏜️ 🌋 ⛰️ 🏕️ ⛺ 🛖 🏠 🏡 🏢 🏥 🏦 🏨 🏪 🏫 ⛪ 🕌 🕍 ⛩️ 🕋 🌅 🌄 🌠 🎇 🎆 🌇 🌆 🏙️ 🌃 🌌 🌉".split(" "),
  },
  {
    id: "simbolos",
    label: "Objetos e símbolos",
    icon: "💡",
    emojis: "⌚ 📱 💻 ⌨️ 🖥️ 🖨️ 🖱️ 📷 📸 📹 🎥 📞 ☎️ 📺 📻 ⏰ ⌛ 🔋 💡 🔦 🕯️ 🧯 💵 💳 💎 ⚖️ 🔧 🔨 ⚒️ 🛠️ ⛏️ 🔩 ⚙️ 🧱 ⛓️ 🧲 🔫 💣 🧨 🪓 🔪 🛡️ 🚬 ⚰️ 🪦 🔮 📿 💈 🧪 🧬 🔬 🔭 📡 💉 🩹 🩺 🚪 🪑 🚽 🚿 🛁 🧹 🧺 🧻 🪣 🧼 🪥 🧽 🛒 🎁 🎈 🎉 🎊 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☪️ 🕉️ ☸️ ✡️ 🔯 ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ ✅ ❌ ❓ ❗ 💯 ⚠️ 🚫 ⭕ ♻️ ©️ ®️ ™️".split(" "),
  },
] as const;

const COMMON_SEARCH: Record<string, string> = {
  "😀": "feliz sorriso sorrindo",
  "😂": "rindo lágrimas engraçado",
  "🤣": "rolando rir engraçado",
  "😊": "feliz tímido sorriso",
  "😍": "apaixonado olhos coração",
  "🥰": "amor carinho apaixonado",
  "😘": "beijo",
  "😉": "piscando",
  "🥺": "pedido triste",
  "😢": "triste choro",
  "😭": "chorando triste",
  "😡": "bravo raiva",
  "🙏": "obrigado agradecimento oração por favor",
  "👍": "curtir gostei positivo sim",
  "👎": "não gostei negativo",
  "👏": "palmas parabéns",
  "🎉": "festa comemoração parabéns",
  "🔥": "fogo sucesso",
  "❤️": "coração vermelho amor",
  "💚": "coração verde",
  "💙": "coração azul",
  "✅": "certo concluído confirmado",
  "❌": "errado cancelar não",
};

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [groupId, setGroupId] = useState<string>("recentes");
  const [query, setQuery] = useState("");
  const emojis = useMemo(() => {
    const term = normalizeSearch(query);
    if (term) {
      return EMOJI_GROUPS.flatMap((group) =>
        [...group.emojis].map((emoji) => ({ emoji, group: group.label })),
      )
        .filter(({ emoji, group }) =>
          normalizeSearch(`${emoji} ${group} ${COMMON_SEARCH[emoji] ?? ""}`).includes(term),
        )
        .map(({ emoji }) => emoji)
        .filter((emoji, index, all) => all.indexOf(emoji) === index);
    }
    return [...(EMOJI_GROUPS.find((group) => group.id === groupId)?.emojis ?? [])];
  }, [groupId, query]);

  return (
    <div className="w-[min(22rem,calc(100vw-3rem))] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--vp-paper-pure)] shadow-[var(--sh-lg)]">
      <div className="p-2.5 pb-1.5">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Pesquisar emoji"
          aria-label="Pesquisar emoji"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--vp-paper)] px-3 py-2 text-sm outline-none focus:border-[var(--vp-wine)]"
        />
      </div>
      <div className="flex border-b border-[var(--border)] px-1" role="tablist" aria-label="Categorias de emojis">
        {EMOJI_GROUPS.map((group) => (
          <button
            key={group.id}
            type="button"
            role="tab"
            aria-selected={groupId === group.id}
            title={group.label}
            onClick={() => {
              setGroupId(group.id);
              setQuery("");
            }}
            className={`flex h-9 flex-1 items-center justify-center border-b-2 text-base transition-colors ${groupId === group.id && !query ? "border-[var(--vp-wine)] bg-[rgba(35,0,4,0.05)]" : "border-transparent hover:bg-[rgba(35,0,4,0.05)]"}`}
          >
            {group.icon}
          </button>
        ))}
      </div>
      <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {query ? "Todos os emojis" : EMOJI_GROUPS.find((group) => group.id === groupId)?.label}
      </div>
      <div className="grid max-h-64 grid-cols-8 overflow-y-auto p-2 pt-0">
        {emojis.length === 0 ? (
          <p className="col-span-8 px-2 py-8 text-center text-sm text-[var(--muted)]">
            Nenhum emoji encontrado.
          </p>
        ) : emojis.map((emoji, index) => (
          <button
            key={`${emoji}-${index}`}
            type="button"
            onClick={() => onSelect(emoji)}
            className="flex size-10 items-center justify-center rounded-lg text-[1.35rem] transition-transform hover:scale-110 hover:bg-[rgba(35,0,4,0.07)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vp-wine)]"
            aria-label={`Inserir ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
