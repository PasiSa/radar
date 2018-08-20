var sigmaObject;
var sigmaFilter;
var buildingGraph = false;

// how _not_ to build user interfaces in js
const shuffleLayoutButton = $("#shuffle-layout-button");
const refreshGraphButton = $("#refresh-graph-button");
const applyFilterButton = $("#apply-filter-graph-button");
const buildGraphButton = $("#build-graph-button");
const invalidateGraphButton = $("#invalidate-graph-button");
const minMatchCountSlider = $("#min-match-count-range");
const minMatchCountSliderValue = $("#min-match-count-range-value");
const minSimilaritySlider = $("#min-similarity-range");
const minSimilaritySliderValue = $("#min-similarity-range-value");
const summaryModal = $("#pair-comparisons-summary-modal");
const buildLoaderMessage = $("#build-loader-message");

shuffleLayoutButton.on("click", _ => shuffleGraphLayout(sigmaObject));

refreshGraphButton.on("click", _ => sigmaObject.refresh());

applyFilterButton.on("click", _ => {
    // Hide edges with weight less than the current min match count slider value
    applyMinEdgeWeightFilter(minMatchCountSlider.val());
    // Hide all nodes that have no edges after filtering
    applyDisconnectedNodesFilter();
});

buildGraphButton.on("click", drawGraphAsync);

invalidateGraphButton.on("click", _ => {
    buildLoaderMessage.text("Invalidating server graph cache ...");
    const csrfToken = $("input[name=csrfmiddlewaretoken]").val();
    $.ajax({
        url: "invalidate",
        type: "POST",
        dataType: "text",
        success: _ => buildLoaderMessage.text("Server graph cache invalidated"),
        error: console.error,
        beforeSend: xhr => xhr.setRequestHeader("X-CSRFToken", csrfToken),
    });
});

minMatchCountSlider.on("input", _ => {
    minMatchCountSliderValue.text(parseInt(minMatchCountSlider.val()));
});
minSimilaritySlider.on("input", _ => {
    minSimilaritySliderValue.text(parseFloat(minSimilaritySlider.val()));
});

function handleEdgeClick(event) {
    const edge = event.data.edge;
    summaryModal.find("h4.modal-title").text(
            edge.source + " and " + edge.target + " have "
            + edge.matchesData.length + " submission pair" + (edge.matchesData.length > 1 ? 's' : '')
            + " with high similarity");
    summaryModal.find("div.modal-body").html(arrayToHTML(edge.matchesData.map(matchToHTML)));
    summaryModal.modal("toggle");
    // TODO fire leave edge hover event to prevent edge highlighting from being stuck when returning from modal view
}

function applyMinEdgeWeightFilter(newMinEdgeWeight) {
    sigmaFilter
        .undo('min-edge-weight')
        .edgesBy(e => e.weight >= newMinEdgeWeight, 'min-edge-weight')
        .apply();
}

function applyDisconnectedNodesFilter() {
    sigmaFilter
        .undo('disconnected-nodes')
        .nodesBy(n => !sigmaObject.graph.adjacentEdges(n.id).every(e => e.hidden), 'disconnected-nodes')
        .apply();
}

function shuffleGraphLayout(s) {
    s.graph.nodes().forEach(n => {
        n.x = Math.random() - 0.5;
        n.y = Math.random() - 0.5;
    });
    s.refresh();
}

function arrayToHTML(strings) {
    return "<ul>" + strings.map(s => "<li>" + s + "</li>").join("\n") + "</ul>";
}

function matchToHTML(match) {
    const elements = [
        "Exercise: <a href='" + match.exercise_url + "'>" + match.exercise_name + "</a>",
        "Comparison view: <a href='" + match.comparison_url + "'>link</a>",
        "Maximum similarity: " + match.max_similarity,
    ];
    return arrayToHTML(elements);
}

function buildGraph(graphData) {
    const s = new sigma({
        renderer: {
            container: "graph-container",
            type: 'canvas'
        },
        settings: {
            minEdgeSize: 1,
            maxEdgeSize: 10,
            enableEdgeHovering: true,
            defaultEdgeHoverColor: '#444',
            edgeHoverExtremities: true,
            edgeLabelSize: 'proportional',
            edgeLabelSizePowRatio: 1.5,
        }
    });

    graphData.nodes.forEach(node => {
        s.graph.addNode({
            id: node,
            label: node,
            size: 1,
            color: '#444',
        });
    });

    graphData.edges.forEach((edge, i) => {
        const matchCount = edge.matches_in_exercises.length;
        s.graph.addEdge({
            id: 'e' + i,
            source: edge.source,
            target: edge.target,
            size: matchCount * 10,
            label: '' + matchCount,
            color: '#ccc',
            hover_color: '#222',
            weight: matchCount,
            matchesData: Array.from(edge.matches_in_exercises),
        });
    });

    return s;
}

function drawGraph(graphData) {
    // Draw graph and assign resulting sigma.js object to global variable
    sigmaObject = buildGraph(graphData);
    sigmaObject.refresh();
    sigmaFilter = new sigma.plugins.filter(sigmaObject);

    shuffleGraphLayout(sigmaObject);

    sigmaObject.bind("clickEdge", handleEdgeClick);

    if (buildingGraph) {
        buildingGraph = false;
    }
    buildLoaderMessage.text("");
}

function drawGraphFromJSON(elementID) {
    return drawGraph(JSON.parse($("#" + elementID).text()));
}

function drawGraphAsync() {
    buildingGraph = true;
    buildLoaderMessage.text("Building graph ...");
    if (typeof sigmaObject !== "undefined") {
        // Clear all active hover effects
        sigmaObject.settings({enableEdgeHovering: false});
        sigmaObject.refresh();
        // Drop all edges and nodes
        sigmaObject.graph.clear();
        // Clear rendered graph from canvas
        sigmaObject.refresh();
    }
    // Assuming we are at graph, do POST to graph/build, with build args in body
    const minSimilarity = minSimilaritySlider.val();
    const csrfToken = $("input[name=csrfmiddlewaretoken]").val();
    $.ajax({
        url: "build",
        type: "POST",
        data: {
            minSimilarity: minSimilarity,
        },
        dataType: "json",
        success: drawGraph,
        error: console.error,
        beforeSend: xhr => xhr.setRequestHeader("X-CSRFToken", csrfToken),
    });
}