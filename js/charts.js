window.DevnexCharts = (() => {
  let statusChart;
  let amountChart;

  const createCharts = (projects) => {
    if (!window.Chart) return;
    const statusCanvas = document.getElementById("statusChart");
    const amountCanvas = document.getElementById("amountChart");
    if (!statusCanvas || !amountCanvas) return;

    const active = projects.filter((p) => DevnexProjectState.status(p) === "active").length;
    const warning = projects.filter((p) => DevnexProjectState.status(p) === "warning").length;
    const blocked = projects.filter((p) => DevnexProjectState.status(p) === "blocked").length;
    const topDebts = [...projects].sort((a, b) => b.amount - a.amount).slice(0, 6);

    const baseOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: "rgba(255,255,255,.72)", boxWidth: 10, usePointStyle: true }
        }
      }
    };

    statusChart?.destroy();
    amountChart?.destroy();

    statusChart = new Chart(statusCanvas, {
      type: "doughnut",
      data: {
        labels: ["Activos", "En aviso", "Bloqueados"],
        datasets: [{
          data: [active, warning, blocked],
          backgroundColor: ["#34d399", "#fbbf24", "#fb7185"],
          borderColor: "rgba(255,255,255,.1)",
          hoverOffset: 8
        }]
      },
      options: { ...baseOptions, cutout: "72%" }
    });

    amountChart = new Chart(amountCanvas, {
      type: "bar",
      data: {
        labels: topDebts.map((project) => project.project_id),
        datasets: [{
          label: "Deuda COP",
          data: topDebts.map((project) => project.amount),
          backgroundColor: "rgba(192,132,252,.72)",
          borderRadius: 8
        }]
      },
      options: {
        ...baseOptions,
        scales: {
          x: { ticks: { color: "rgba(255,255,255,.62)" }, grid: { color: "rgba(255,255,255,.06)" } },
          y: { ticks: { color: "rgba(255,255,255,.62)" }, grid: { color: "rgba(255,255,255,.06)" } }
        }
      }
    });
  };

  return { createCharts };
})();
