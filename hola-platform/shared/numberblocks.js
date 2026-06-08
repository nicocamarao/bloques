export const NUMBERBLOCKS = {
  1: { name: "One", src: "https://static.wikia.nocookie.net/numberblocks/images/2/21/DiaOne.png/revision/latest/scale-to-width-down/112?cb=20250709141239" },
  2: { name: "Two", src: "https://static.wikia.nocookie.net/numberblocks/images/1/1f/DiaTwo.png/revision/latest/scale-to-width-down/112?cb=20250709141325" },
  3: { name: "Three", src: "https://static.wikia.nocookie.net/numberblocks/images/f/f6/DiaThree.png/revision/latest/scale-to-width-down/112?cb=20220701224832" },
  4: { name: "Four", src: "https://static.wikia.nocookie.net/numberblocks/images/e/ee/DiaFour.png/revision/latest/scale-to-width-down/112?cb=20250111121943" },
  5: { name: "Five", src: "https://static.wikia.nocookie.net/numberblocks/images/7/79/DiaFiveNew.png/revision/latest/scale-to-width-down/112?cb=20250827215124" },
  6: { name: "Six", src: "https://static.wikia.nocookie.net/numberblocks/images/f/fd/DiaSix.png/revision/latest/scale-to-width-down/112?cb=20220701225037" },
  7: { name: "Seven", src: "https://static.wikia.nocookie.net/numberblocks/images/5/58/DiaSevenNew.png/revision/latest/scale-to-width-down/112?cb=20250825220414" },
  8: { name: "Eight", src: "https://static.wikia.nocookie.net/numberblocks/images/2/21/DiaEightNew.jpeg/revision/latest/scale-to-width-down/112?cb=20250111121632" },
  9: { name: "Nine", src: "https://static.wikia.nocookie.net/numberblocks/images/7/7b/DiaNineNew.png/revision/latest/scale-to-width-down/112?cb=20250924124022" },
  10: { name: "Ten", src: "https://static.wikia.nocookie.net/numberblocks/images/a/aa/DiaTen.png/revision/latest/scale-to-width-down/112?cb=20250111121725" },
  11: { name: "Eleven", src: "https://static.wikia.nocookie.net/numberblocks/images/a/a7/DiaEleven.png/revision/latest/scale-to-width-down/112?cb=20250717000130" },
  12: { name: "Twelve", src: "https://static.wikia.nocookie.net/numberblocks/images/3/3f/DiaTwelve.png/revision/latest/scale-to-width-down/112?cb=20210126063654" }
};

export function blockForNumber(number) {
  return NUMBERBLOCKS[Math.max(1, number)] || NUMBERBLOCKS[1];
}
