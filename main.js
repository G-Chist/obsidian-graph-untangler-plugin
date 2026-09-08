const { Plugin, PluginSettingTab, Setting, Notice } = require("obsidian");

const DEFAULT_SETTINGS = {
  durationSec: 30,
  periodMs: 1000,
  peakStrength: 10000,
};

module.exports = class GraphUntanglerPlugin extends Plugin {
  async onload() {
    this.stopped = false;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    this.addCommand({
      id: "untangle-graph",
      name: "Untangle Graph",
      callback: () => this.untangle(),
    });

    this.addCommand({
      id: "stop-untangle",
      name: "Stop Untangling Graph",
      callback: () => {
        this.stopped = true;
        new Notice("Untangling stopped");
      },
    });

    this.addSettingTab(new GraphUntanglerSettingTab(this.app, this));
  }

  getGraphLeaf() {
    const leaves = this.app.workspace.getLeavesOfType("graph");
    if (leaves.length > 0) return leaves[0];
    return this.app.workspace.getLeavesOfType("localgraph")[0] || null;
  }

  findSliderByLabel(container, label) {
    const items = container.querySelectorAll(".setting-item.mod-slider");
    for (const item of items) {
      const name = item.querySelector(".setting-item-name");
      if (name && name.textContent.trim().toLowerCase() === label) {
        return item.querySelector('input[type="range"]');
      }
    }
    return null;
  }

  getForceSliders(view) {
    const container = view.dataEngine?.forceOptions?.el;
    if (!container) return null;
    container.classList.remove("is-collapsed");
    return {
      center: this.findSliderByLabel(container, "center force"),
      repel: this.findSliderByLabel(container, "repel force"),
      link: this.findSliderByLabel(container, "link force"),
      distance: this.findSliderByLabel(container, "link distance"),
    };
  }

  setSliderValue(slider, value) {
    if (!slider) return;
    slider.value = value;
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async untangle() {
    const { durationSec, periodMs, peakStrength } = this.settings;
    const durationMs = durationSec * 1000;
    this.stopped = false;

    const leaf = this.getGraphLeaf();
    if (!leaf) {
      new Notice("No graph view open");
      return;
    }

    const renderer = leaf.view.renderer;
    if (!renderer || typeof renderer.setForces !== "function") {
      new Notice("Graph renderer does not support setForces");
      return;
    }

    const sliders = this.getForceSliders(leaf.view);
    if (!sliders || !sliders.link || !sliders.center) {
      new Notice("Could not find graph control sliders");
      return;
    }

    new Notice("Untangling graph...");

    renderer.setForces({ center: { strength: 0 } });
    renderer.setForces({ repel: { strength: 20 } });
    this.setSliderValue(sliders.repel, 20);
    this.setSliderValue(sliders.center, 0);
    await this.sleep(300);

    const startTime = Date.now();
    const freq = (2 * Math.PI) / periodMs;
    let lastUpdate = 0;
    const sliderMax = parseFloat(sliders.link.max);

    while (true) {
      if (this.stopped) break;

      const elapsed = Date.now() - startTime;
      if (elapsed > durationMs) break;

      const strength = (peakStrength / 2) * (1 + Math.sin(freq * elapsed));

      if (Math.abs(strength - lastUpdate) > 1) {
        renderer.setForces({
          link: { strength },
        });
        this.setSliderValue(
          sliders.link,
          (strength / peakStrength) * sliderMax
        );
        lastUpdate = strength;
      }

      await this.sleep(50);
    }

    if (!this.stopped) {
      new Notice("Untangling complete");
      renderer.setForces({ center: { strength: 0.4 } });
      this.setSliderValue(sliders.center, 0.4);
    }
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
};

class GraphUntanglerSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Duration")
      .setDesc("Total animation time in seconds.")
      .addSlider((slider) =>
        slider
          .setLimits(5, 120, 1)
          .setValue(this.plugin.settings.durationSec)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.durationSec = value;
            await this.plugin.saveData(this.plugin.settings);
          })
      );

    new Setting(containerEl)
      .setName("Period")
      .setDesc("Sine wave period in milliseconds (time per pulse cycle).")
      .addSlider((slider) =>
        slider
          .setLimits(100, 5000, 100)
          .setValue(this.plugin.settings.periodMs)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.periodMs = value;
            await this.plugin.saveData(this.plugin.settings);
          })
      );

    new Setting(containerEl)
      .setName("Peak strength")
      .setDesc("Maximum link force strength during pulsing.")
      .addSlider((slider) =>
        slider
          .setLimits(1000, 50000, 1000)
          .setValue(this.plugin.settings.peakStrength)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.peakStrength = value;
            await this.plugin.saveData(this.plugin.settings);
          })
      );
  }
}

/* nosourcemap */
/* nosourcemap */