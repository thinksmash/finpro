<script>
  import { scaleLinear, scaleOrdinal } from "d3-scale";
  import {
    Graphic,
    Section,
    PointLayer,
    Label,
    XAxis,
    YAxis
  } from "@snlab/florence";
  import DataContainer from "@snlab/florence-datacontainer";
  import { data } from "./data.js";

  const plottings = new DataContainer(data);

  const padding = { left: 60, bottom: 10, top: 10, right: 10 };

  let colourScale = scaleLinear()
    .domain([0, 36])
    .range(["rgb(255, 0, 0)", "rgb(0, 255, 127)"]);

  let colourBand = scaleOrdinal()
    .domain(["Low", "Lower middle", "Upper middle", "High"])
    .range(['#f7f7f7','#cccccc','#969696','#525252'])

  let areaScale = scaleLinear()
    .domain(plottings.domain("Under20"))
    .range([5, 12]);

  // Point selection
  let selectedIndex = "";
  let selectedRow = "";
  let incomeBand = ""

  function selectPoint(event) {
    selectedIndex = event.index;
    selectedRow = plottings.row({ index: selectedIndex });
    incomeBand = plottings.filter(row => row.Income == selectedRow.Income);
  }

  function deselectPoint() {
    selectedIndex = "";
    selectedRow = "";
  }
</script>


<div class="graph">
  <div>
    <h1>
      Youth Wellbeing in Relation to the Average Age of the Population and the Average Age of National Legislators
    </h1>
    <h2>
      A preliminary analysis of 25 countries around the world based on UN and World Bank data.
    </h2>
  </div>
  <div class="chart" style="width: 60%; height: 100%; float:left;">
    <Graphic width={1000} height={1000}>
      <Section
        x1={0}
        x2={0.9}
        y1={0.7}
        y2={0}
        {padding}
        scaleX={[15, 51]}
        scaleY={[39, 65]}
      >
        <PointLayer 
          x={plottings.column("PopAge")} 
          y={plottings.column("LegAge")} 
          radius={plottings.map("Under20", areaScale)}
          fill={plottings.map("YWBI", colourScale)} 
          opacity={(event) => event.index === selectedIndex ? 1 : 0.7 }
          onMouseover={selectPoint}
          onMouseout={deselectPoint}
        />
        
        {#if selectedRow !== ""}
          <PointLayer
            x={incomeBand.column("PopAge")} 
            y={incomeBand.column("LegAge")} 
            radius=2.5
            fill="white"
            fillOpacity=0.9
          />
          <Label
            fill="#043754"
            x={selectedRow.PopAge}
            y={selectedRow.LegAge}
            anchorPoint=l
            rotate=0.2
            fontFamily="Source Code Pro"
            fontSize=15
            text={"–" + selectedRow.Country}
          />
        {/if}
        <XAxis 
          title="Average age of population" 
          titleColor=#95d2f5 
          titleFontSize=18 
          titleFontWeight="bold" 
          titleVjust={1.02} 
          tickCount=18 
        />
        <YAxis 
          title="Average age of legislators" 
          titleColor=#95d2f5 
          titleFontSize=18 
          titleFontWeight="bold" 
          titleHjust={-0.06} 
          tickCount=12 
        />
      </Section>
    </Graphic>
  </div>
  <div style="width: 40%; height: 100%; float:right;">
    <h3>
      Visualization goals and design choices
    </h3>
    <p>
      This visualization explores the relationship, if any, between the relative youth of a population and its legislature (as proxies for the social and political representation of younger people, ages 0-30) with the general well-being of young people. 
      The visualization is built on a fairly complex table, where each item has 13 attributes. I've designed this visualization to provide a big-picture perspective of the data without overwhelming detail. 
      Most of the attributes have been used to construct a colour-coded index to measure this concept of youth well-being introduced here. 
      I've used colour hue (red to green) as the channel to indicate the multi-measure index. The index is three-tiered (“survival”, “prospects”, and “futurity") and the tiers are weighted (1-3) in declining order.
      I've used aligned spatial positions to indicate the most important ordered attributes in my dataset, namely the average ages of population and legislature. Less important, "nice to know" data will be indicated by the size of my points (currently at a default size comfortable for hovering) and the thickness of its border line. 
      If the implicit hypothesis of this visualization is that youth representation in politics leads to better policy outcomes for young people, the obvious alternative hypothesis is that youth representation is irrelevant and what matters is a country's income/development level. I thus include a link to points of similar income levels (World Bank groupings based on per capita GNI).
    </p>
  </div>
</div>

<style>
  /* headings */
  h1,
  h2 {
    font-family: "Inter", monospace;
    text-align: center;
    color: rgb(149, 210, 245);
  }

  h1 {
    font-size: 24px;
  }

  h2 {
    font-size: 17px;
  }

  h3 {
    font-family: "Inter";
    text-align: left;
    text-decoration: underline;
    color: rgba(54, 78, 94, 0.877);
    font-size: 15px;
  }

  p {
    width: 800px;
    font-family: "Inter";
    font-size: 13px;
    text-align: left;
    color: rgba(54, 78, 94, 0.877);
  }
</style>