export const NUMBERBLOCKS = [
  {
    number: 1,
    name: "One",
    src: "https://static.wikia.nocookie.net/numberblocks/images/2/21/DiaOne.png/revision/latest/scale-to-width-down/112?cb=20250709141239"
  },
  {
    number: 2,
    name: "Two",
    src: "https://static.wikia.nocookie.net/numberblocks/images/1/1f/DiaTwo.png/revision/latest/scale-to-width-down/112?cb=20250709141325"
  },
  {
    number: 3,
    name: "Three",
    src: "https://static.wikia.nocookie.net/numberblocks/images/f/f6/DiaThree.png/revision/latest/scale-to-width-down/112?cb=20220701224832"
  },
  {
    number: 4,
    name: "Four",
    src: "https://static.wikia.nocookie.net/numberblocks/images/e/ee/DiaFour.png/revision/latest/scale-to-width-down/112?cb=20250111121943"
  },
  {
    number: 5,
    name: "Five",
    src: "https://static.wikia.nocookie.net/numberblocks/images/7/79/DiaFiveNew.png/revision/latest/scale-to-width-down/112?cb=20250827215124"
  },
  {
    number: 6,
    name: "Six",
    src: "https://static.wikia.nocookie.net/numberblocks/images/f/fd/DiaSix.png/revision/latest/scale-to-width-down/112?cb=20220701225037"
  },
  {
    number: 7,
    name: "Seven",
    src: "https://static.wikia.nocookie.net/numberblocks/images/5/58/DiaSevenNew.png/revision/latest/scale-to-width-down/112?cb=20250825220414"
  },
  {
    number: 8,
    name: "Eight",
    src: "https://static.wikia.nocookie.net/numberblocks/images/2/21/DiaEightNew.jpeg/revision/latest/scale-to-width-down/112?cb=20250111121632"
  },
  {
    number: 9,
    name: "Nine",
    src: "https://static.wikia.nocookie.net/numberblocks/images/7/7b/DiaNineNew.png/revision/latest/scale-to-width-down/112?cb=20250924124022"
  },
  {
    number: 10,
    name: "Ten",
    src: "https://static.wikia.nocookie.net/numberblocks/images/a/aa/DiaTen.png/revision/latest/scale-to-width-down/112?cb=20250111121725"
  },
  {
    number: 11,
    name: "Eleven",
    src: "https://static.wikia.nocookie.net/numberblocks/images/a/a7/DiaEleven.png/revision/latest/scale-to-width-down/112?cb=20250717000130"
  },
  {
    number: 12,
    name: "Twelve",
    src: "https://static.wikia.nocookie.net/numberblocks/images/3/3f/DiaTwelve.png/revision/latest/scale-to-width-down/112?cb=20210126063654"
  }
];

export function shuffle(values) {
  const items = [...values];
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function tileForNumber(number) {
  return NUMBERBLOCKS[(Math.max(1, number) - 1) % NUMBERBLOCKS.length];
}

export function pairSet(count) {
  return shuffle(Array.from({ length: count }, (_, index) => index + 1).flatMap((value) => [value, value]));
}
