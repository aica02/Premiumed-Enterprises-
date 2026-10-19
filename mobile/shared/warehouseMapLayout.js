export const warehouseMapLayout = {
  tables: [
    { id: "table-1", top: "15%", left: "62%", width: "5%", height: "12%" }, //cold storage table
    { id: "table-2", top: "50%", left: "91%", width: "5%", height: "12%" }, //ofice table
  ],

  pallets: [
    // right
    { id: "P1-A", top: "10%", left: "30%", width: "5%", height: "7%" },
    { id: "P1-B", top: "17.5%", left: "30%", width: "5%", height: "7%" },
    { id: "P1-C", top: "25%", left: "30%", width: "5%", height: "7%" },
    { id: "P1-D", top: "32.5%", left: "30%", width: "5%", height: "7%" },
    // middle
    { id: "P2-A", top: "10%", left: "18%", width: "5%", height: "7%" },
    { id: "P2-B", top: "17.5%", left: "18%", width: "5%", height: "7%" },
    { id: "P2-C", top: "25%", left: "18%", width: "5%", height: "7%" },
    { id: "P2-D", top: "32.5%", left: "18%", width: "5%", height: "7%" },
    { id: "P3-A", top: "10%", left: "12%", width: "5%", height: "7%" },
    { id: "P3-B", top: "17.5%", left: "12%", width: "5%", height: "7%" },
    { id: "P3-C", top: "25%", left: "12%", width: "5%", height: "7%" },
    { id: "P3-D", top: "32.5%", left: "12%", width: "5%", height: "7%" },

    // left
    { id: "P4-A", top: "10%", left: "1%", width: "5%", height: "7%" },
    { id: "P4-B", top: "17.5%", left: "1%", width: "5%", height: "7%" },
    { id: "P4-C", top: "25%", left: "1%", width: "5%", height: "7%" },
    { id: "P4-D", top: "32.5%", left: "1%", width: "5%", height: "7%" },

    // bottom
    { id: "P5-A", top: "45%", left: "1%", width: "7%", height: "5%" },
    { id: "P5-B", top: "45%", left: "8.5%", width: "7%", height: "5%" },
    { id: "P5-C", top: "45%", left: "16%", width: "7%", height: "5%" },
    { id: "P5-D", top: "45%", left: "23.5%", width: "7%", height: "5%" },
  ],

  labels: [
    { id: "label-1", text: "Cold Storage", top: "33%", left: "62%" },
    { id: "label-2", text: "Dry Storage", top: "41%", left: "22%" },
    { id: "label-3", text: "Receiving Area", top: "78%", left: "7%" },
    { id: "label-4", text: "Dispatch Area", top: "86%", left: "69.5%" },
    { id: "label-5", text: "Disposal\nArea", top: "50%", left: "42.5%" },
    { id: "label-6", text: "Office", top: "55%", left: "75%" },
  ],

  lines: [
    // walls
    { id: "top-wall", top: "3.5%", left: "0%", width: "98%", height: 2 },
    {
      id: "bottom-wall",
      top: "99.7%",
      left: "0%",
      width: "98%",
      height: 2,
    },

    {
      id: "left-wall",
      top: "3.5%",
      left: "0%",
      width: 2,
      height: "96.5%",
    },

    {
      id: "right-wall",
      top: "3.5%",
      left: "98%",
      width: 2,
      height: "96.5%",
    },

    {
      //dry storage divider
      id: "dvdr-wall-v-1",
      top: "3.5%",
      left: "35%",
      width: 2,
      height: "3%",
    },

    {
      id: "dvdr-wall-v-2",
      top: "10%",
      left: "35%",
      width: 2,
      height: "30%",
    },

    {
      id: "dvdr-wall-v-3",
      top: "46.4%",
      left: "35%",
      width: 2,
      height: "5%",
    },

    {
      id: "dvdr-wall-h-1",
      top: "51%",
      left: "0%",
      width: "35%",
      height: 2,
    },

    {
      //cold storage divider
      id: "dvdr-wall-v-4",
      top: "3.5%",
      left: "60%",
      width: 2,
      height: "33%",
    },

    {
      id: "dvdr-wall-h-2",
      top: "45%",
      left: "60%",
      width: "2%",
      height: 2,
    },

    {
      id: "dvdr-wall-h-3",
      top: "45%",
      left: "65%",
      width: "33%",
      height: 2,
    },

    {
      //ofice divider
      id: "dvdr-wall-v-5",
      top: "41.5%",
      left: "60%",
      width: 2,
      height: "10%",
    },

    {
      id: "dvdr-wall-v-6",
      top: "58%",
      left: "60%",
      width: 2,
      height: "8%",
    },

    {
      id: "dvdr-wall-h-4",
      top: "66%",
      left: "60%",
      width: "38%",
      height: 2,
    },
  ],

  // for mobile
  areas: [
    {
      id: "receiving-area",
      top: "58%",
      left: "2.5%",
      width: "24%",
      height: "39%",
    },
    {
      id: "disposal-area",
      top: "40%",
      left: "41%",
      width: "12%",
      height: "26%",
    },
    {
      id: "dispatch-area",
      top: "77%",
      left: "56.5%",
      width: "39%",
      height: "20%",
    },
  ],

  racks: [
    {
      id: "R2-A",
      top: "3%",
      left: "93%",
      width: "5%",
      height: "8%",
      className: "R2",
    },
    {
      id: "R2-B",
      top: "11%",
      left: "93%",
      width: "5%",
      height: "8%",
      className: "R2",
    },
    {
      id: "R2-C",
      top: "19%",
      left: "93%",
      width: "5%",
      height: "8%",
      className: "R2",
    },
    {
      id: "R2-D",
      top: "27%",
      left: "93%",
      width: "5%",
      height: "8%",
      className: "R2",
    },
    {
      id: "R2-E",
      top: "35%",
      left: "93%",
      width: "5%",
      height: "8%",
      className: "R2",
    },

    {
      id: "R1-A",
      top: "2%",
      left: "94%",
      width: "5%",
      height: "8%",
      className: "R1",
    },
    {
      id: "R1-B",
      top: "10%",
      left: "94%",
      width: "5%",
      height: "8%",
      className: "R1",
    },
    {
      id: "R1-C",
      top: "18%",
      left: "94%",
      width: "5%",
      height: "8%",
      className: "R1",
    },
    {
      id: "R1-D",
      top: "26%",
      left: "94%",
      width: "5%",
      height: "8%",
      className: "R1",
    },
    {
      id: "R1-E",
      top: "34%",
      left: "94%",
      width: "5%",
      height: "8%",
      className: "R1",
    },

    {
      id: "R3-I",
      top: "39%",
      left: "82%",
      width: "8%",
      height: "5%",
      className: "R5",
    },
    {
      id: "R3-H",
      top: "39%",
      left: "74%",
      width: "8%",
      height: "5%",
      className: "R5",
    },
    {
      id: "R3-G",
      top: "39%",
      left: "66%",
      width: "8%",
      height: "5%",
      className: "R5",
    },

    {
      id: "R3-F",
      top: "38%",
      left: "83%",
      width: "8%",
      height: "5%",
      className: "R4",
    },
    {
      id: "R3-E",
      top: "38%",
      left: "75%",
      width: "8%",
      height: "5%",
      className: "R4",
    },
    {
      id: "R3-D",
      top: "38%",
      left: "67%",
      width: "8%",
      height: "5%",
      className: "R4",
    },

    {
      id: "R3-C",
      top: "37%",
      left: "84%",
      width: "8%",
      height: "5%",
      className: "R3",
    },
    {
      id: "R3-B",
      top: "37%",
      left: "76%",
      width: "8%",
      height: "5%",
      className: "R3",
    },
    {
      id: "R3-A",
      top: "37%",
      left: "68%",
      width: "8%",
      height: "5%",
      className: "R3",
    },

    {
      id: "R4-F",
      top: "3%",
      left: "82%",
      width: "8%",
      height: "5%",
      className: "R4",
    },
    {
      id: "R4-E",
      top: "3%",
      left: "74%",
      width: "8%",
      height: "5%",
      className: "R4",
    },
    {
      id: "R4-D",
      top: "3%",
      left: "66%",
      width: "8%",
      height: "5%",
      className: "R4",
    },
    {
      id: "R4-C",
      top: "2%",
      left: "83%",
      width: "8%",
      height: "5%",
      className: "R4",
    },
    {
      id: "R4-B",
      top: "2%",
      left: "75%",
      width: "8%",
      height: "5%",
      className: "R4",
    },
    {
      id: "R4-A",
      top: "2%",
      left: "67%",
      width: "8%",
      height: "5%",
      className: "R4",
    },

    {
      id: "R5-C",
      top: "13%",
      left: "79%",
      width: "5%",
      height: "10%",
      className: "R5",
    },
    {
      id: "R5-D",
      top: "23%",
      left: "79%",
      width: "5%",
      height: "10%",
      className: "R5",
    },
    {
      id: "R5-A",
      top: "12%",
      left: "80%",
      width: "5%",
      height: "10%",
      className: "R5",
    },
    {
      id: "R5-B",
      top: "22%",
      left: "80%",
      width: "5%",
      height: "10%",
      className: "R5",
    },

    {
      id: "R6-F",
      top: "3%",
      left: "17%",
      width: "8%",
      height: "5%",
      className: "R6",
    },
    {
      id: "R6-E",
      top: "3%",
      left: "9%",
      width: "8%",
      height: "5%",
      className: "R6",
    },
    {
      id: "R6-D",
      top: "2%",
      left: "18%",
      width: "8%",
      height: "5%",
      className: "R6",
    },
    {
      id: "R6-C",
      top: "2%",
      left: "10%",
      width: "8%",
      height: "5%",
      className: "R6",
    },
    {
      id: "R6-B",
      top: "1%",
      left: "19%",
      width: "8%",
      height: "5%",
      className: "R6",
    },
    {
      id: "R6-A",
      top: "1%",
      left: "11%",
      width: "8%",
      height: "5%",
      className: "R6",
    },
  ],
};
