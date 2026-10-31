<script setup lang="ts">
import {reactive, onMounted, onBeforeUnmount} from "vue";
import {t} from "@/language";
import {App,Hooks,getDefaultParticleConfig,Utils,Particle} from "@astral3d/engine";
import Attributes from './particle/Sidebar.Particle.Attribute.vue';
import Initializer from './particle/Sidebar.Particle.Initializer.vue';
import Behaviour from './particle/Sidebar.Particle.Behaviour.vue';

const particleData = reactive<IParticle.Config>(getDefaultParticleConfig());

onMounted(() => {
  Hooks.useAddSignal("objectSelected", updateUI);

  updateUI();
})
onBeforeUnmount(() => {
  Hooks.useRemoveSignal("objectSelected", updateUI);
})

function updateUI() {
  const object = App.selected;
  if(!object) return;

  if (!Utils.isParticleObject(object)) return;

  const emitterJSON = object.getEmitterJSON();

  Utils.deepAssign(particleData, emitterJSON);
}

function update(method: string) {
  const object = App.selected;
  if(!object) return;

  if (!Utils.isParticleObject(object)) return;

  const emitter = object.emitter as InstanceType<typeof Particle.Emitter>;
  const call = {
    // attribute
    totalEmitTimes: () => {
      if (emitter.totalEmitTimes !== undefined && emitter.totalEmitTimes !== particleData.attr.totalEmitTimes) {
        emitter.setTotalEmitTimes(particleData.attr.totalEmitTimes);
      }
    },
    damping: () => {
      if (emitter.damping !== particleData.attr.damping) {
        emitter.damping = particleData.attr.damping;
      }
    },
    life: () => {
      if (emitter.life !== undefined && emitter.life !== particleData.attr.life) {
        emitter.setLife(particleData.attr.life);
      }
    },
    rateNumPan: () => {
      if (emitter.rate.numPan.a !== particleData.attr.numPan.min || emitter.rate.numPan.b !== particleData.attr.numPan.max) {
        emitter.rate.numPan.a = particleData.attr.numPan.min;
        emitter.rate.numPan.b = particleData.attr.numPan.max;
      }
    },
    rateTimePan: () => {
      if (emitter.rate.timePan.a !== particleData.attr.timePan.a || emitter.rate.timePan.b !== particleData.attr.timePan.b) {
        emitter.rate.timePan.a = particleData.attr.timePan.a;
        emitter.rate.timePan.b = particleData.attr.timePan.b;
      }
    },
    // initializer
    mass: () => {
      const initializer = emitter.initializers.find((item) => item.type === "Mass");
      if (!initializer) {
        emitter.addInitializer(
          new Particle.Mass(
            particleData.init.mass.min, 
            particleData.init.mass.max, 
            particleData.init.mass.center, 
            particleData.init.mass.isEnabled
          )
        );
      } else {
        initializer.isEnabled = particleData.init.mass.isEnabled;
        initializer.massPan.a = particleData.init.mass.min;
        initializer.massPan.b = particleData.init.mass.max;
        initializer.massPan._center = particleData.init.mass.center;
      }

      // 需要注意的是，如果mass的isEnabled为false，则behaviour中的collision的useMass也会自动变为false
      if (!particleData.init.mass.isEnabled && particleData.behaviour.collision.useMass) {
        const behaviour = emitter.behaviours.find((item) => item.type === "Collision");
        if (!behaviour) return;

        particleData.behaviour.collision.useMass = false;
        update("collision");
      }
    },
    initializerLife: () => {
      const initializer = emitter.initializers.find((item) => item.type === "Life");
      if (!initializer) {
        emitter.addInitializer(new Particle.Life(particleData.init.life.min, particleData.init.life.max, particleData.init.life.center, particleData.init.life.isEnabled));
      } else {
        initializer.isEnabled = particleData.init.life.isEnabled;
        initializer.lifePan.a = particleData.init.life.min;
        initializer.lifePan.b = particleData.init.life.max;
        initializer.lifePan._center = particleData.init.life.center;
      }
    },
    radius: () => {
      const initializer = emitter.initializers.find((item) => item.type === "Radius");
      if (!initializer) {
        emitter.addInitializer(new Particle.Radius(particleData.init.radius.width, particleData.init.radius.height, particleData.init.radius.center, particleData.init.radius.isEnabled));
      } else {
        initializer.isEnabled = particleData.init.radius.isEnabled;
        initializer.radius.a = particleData.init.radius.width;
        initializer.radius.b = particleData.init.radius.height;
        initializer.radius._center = particleData.init.radius.center;
      }
    },
    rotation: () => {
      const initializer = emitter.initializers.find((item) => item.type === "Rotation");
      if (!initializer) {
        emitter.addInitializer(
            new Particle.Rotation(
                particleData.init.rotation.x,
                particleData.init.rotation.y,
                particleData.init.rotation.z,
                particleData.init.rotation.useEmitterRotation,
                particleData.init.rotation.isEnabled
            )
        );
      } else {
        initializer.isEnabled = particleData.init.rotation.isEnabled;
        initializer.rotation.x = particleData.init.rotation.x;
        initializer.rotation.y = particleData.init.rotation.y;
        initializer.rotation.z = particleData.init.rotation.z;
        initializer.useEmitterRotation = particleData.init.rotation.useEmitterRotation;
      }
    },
    zone: () => {
      const initializer = emitter.initializers.find((item) => item.type === "Position") as InstanceType<typeof Particle.Position>;
      if (!initializer || initializer.zones[0].type !== particleData.init.position.zone?.type) {
        let position = new Particle.Position();
        if (!initializer) {
          emitter.addInitializer(position);
        } else {
          position = initializer;
          position.reset();
        }

        let zone;
        const zoneData = particleData.init.position.zone;
        switch (zoneData?.type) {
          case 'PointZone':
            zone = new Particle.PointZone(zoneData.x, zoneData.y, zoneData.z);
            break;
          case 'LineZone':
            zone = new Particle.LineZone(
                zoneData.x1,
                zoneData.y1,
                zoneData.z1,
                zoneData.x2,
                zoneData.y2,
                zoneData.z2,
            );
            break;
          case 'BoxZone':
            zone = new Particle.BoxZone(
                zoneData.x,
                zoneData.y,
                zoneData.z,
                zoneData.width,
                zoneData.height,
                zoneData.depth,
            );
            break;
          case 'SphereZone':
            zone = new Particle.SphereZone(
                zoneData.x,
                zoneData.y,
                zoneData.z,
                zoneData.radius
            );
            break;
        }
        if (!zone) return;

        position.addZone(zone);
      } else {
        initializer.isEnabled = particleData.init.position.isEnabled;
        if (!particleData.init.position.zone) return;

        Object.keys(particleData.init.position.zone).forEach(key => {
          if (key === 'type') return;
          // @ts-ignore
          initializer.zones[0][key] = particleData.init.position.zone[key];
        })
      }
    },
    velocity: () => {
      if (!particleData.init.velocity.velocity) return;

      // const initializer = emitter.initializers.find((item) => item.type === particleData.init.velocity.velocity?.type);
      // 速度初始化器同时只能存在一个，所以先移除掉之前的不同类型的
      let initializer = emitter.initializers.find((item) => item.type.indexOf('Velocity') !== -1);
      if (initializer && initializer.type !== particleData.init.velocity.velocity?.type) {
        emitter.removeInitializer(initializer);
        initializer = null;
      }

      if (!initializer) {
        const velocity = particleData.init.velocity.velocity;
        switch (velocity.type) {
          case "RadialVelocity":
            emitter.addInitializer(
                new Particle.RadialVelocity(
                    velocity.radius,
                    new Particle.Vector3D(velocity.x, velocity.y, velocity.z),
                    velocity.theta,
                    particleData.init.velocity.isEnabled
                )
            );
            break;
          case "PolarVelocity":
            emitter.addInitializer(
                new Particle.PolarVelocity(
                    new Particle.Polar3D(velocity.radius, velocity.theta * Math.PI / 180, velocity.phi * Math.PI / 180),
                    velocity.tha,
                    particleData.init.velocity.isEnabled
                )
            );
            break;
          case "VectorVelocity":
            emitter.addInitializer(
                new Particle.VectorVelocity(
                    new Particle.Vector3D(velocity.x, velocity.y, velocity.z),
                    velocity.theta,
                    particleData.init.velocity.isEnabled
                )
            );
            break;
        }
      } else {
        initializer.isEnabled = particleData.init.velocity.isEnabled;
        const velocity = particleData.init.velocity.velocity;
        switch (velocity.type) {
          case "RadialVelocity":
            initializer.radiusPan.a = initializer.radiusPan.b = velocity.radius;
            initializer.dir.x = velocity.x;
            initializer.dir.y = velocity.y;
            initializer.dir.z = velocity.z;
            initializer.tha = velocity.theta * Math.PI / 180;
            break;
          case "PolarVelocity":
            const dirVec = new Particle.Polar3D(velocity.radius, velocity.theta * Math.PI / 180, velocity.phi * Math.PI / 180).toVector3D();

            initializer.dirVec.x = dirVec.x;
            initializer.dirVec.y = dirVec.y;
            initializer.dirVec.z = dirVec.z;
            initializer.tha = velocity.tha * Math.PI / 180;
            break;
          case "VectorVelocity":
            initializer.dir.x = velocity.x;
            initializer.dir.y = velocity.y;
            initializer.dir.z = velocity.z;
            initializer.tha = velocity.theta * Math.PI / 180;
            break;
        }
      }
    },
    // behaviour
    color: () => {
      const behaviour = emitter.behaviours.find((item) => item.type === "Color");
      if (!behaviour) {
        emitter.addBehaviour(
            new Particle.Color(
                particleData.behaviour.color.colorA,
                particleData.behaviour.color.colorB,
                particleData.behaviour.color.life,
                Particle.ease[particleData.behaviour.color.easing],
                particleData.behaviour.color.isEnabled
            )
        );
      } else {
        behaviour.isEnabled = particleData.behaviour.color.isEnabled;
        behaviour.colorA.colors[0] = particleData.behaviour.color.colorA;
        behaviour.colorB.colors[0] = particleData.behaviour.color.colorB;
        behaviour._life = particleData.behaviour.color.life;
        behaviour.easing = Particle.ease[particleData.behaviour.color.easing];
      }
    },
    scale: () => {
      const behaviour = emitter.behaviours.find((item) => item.type === "Scale");
      if (!behaviour) {
        emitter.addBehaviour(
            new Particle.Scale(
                particleData.behaviour.scale.scaleA,
                particleData.behaviour.scale.scaleB,
                particleData.behaviour.scale.life,
                Particle.ease[particleData.behaviour.scale.easing],
                particleData.behaviour.scale.isEnabled
            )
        );
      } else {
        behaviour.isEnabled = particleData.behaviour.scale.isEnabled;
        behaviour.scaleA.a = behaviour.scaleA.b = particleData.behaviour.scale.scaleA;
        behaviour.scaleB.a = behaviour.scaleB.b = particleData.behaviour.scale.scaleB;
        behaviour._life = particleData.behaviour.scale.life;
        behaviour.easing = Particle.ease[particleData.behaviour.scale.easing];
      }
    },
    alpha: () => {
      const behaviour = emitter.behaviours.find((item) => item.type === "Alpha");
      if (!behaviour) {
        emitter.addBehaviour(
            new Particle.Alpha(
                particleData.behaviour.alpha.alphaA,
                particleData.behaviour.alpha.alphaB,
                particleData.behaviour.alpha.life,
                Particle.ease[particleData.behaviour.alpha.easing],
                particleData.behaviour.alpha.isEnabled
            )
        );
      } else {
        behaviour.isEnabled = particleData.behaviour.alpha.isEnabled;
        behaviour.alphaA.a = behaviour.alphaA.b = particleData.behaviour.alpha.alphaA;
        behaviour.alphaB.a = behaviour.alphaB.b = particleData.behaviour.alpha.alphaB;
        behaviour._life = particleData.behaviour.alpha.life;
        behaviour.easing = Particle.ease[particleData.behaviour.alpha.easing];
      }
    },
    force: () => {
      const behaviour = emitter.behaviours.find((item) => item.type === "Force");
      if (!behaviour) {
        emitter.addBehaviour(
            new Particle.Force(
                particleData.behaviour.force.fx,
                particleData.behaviour.force.fy,
                particleData.behaviour.force.fz,
                particleData.behaviour.force.life,
                Particle.ease[particleData.behaviour.force.easing],
                particleData.behaviour.force.isEnabled
            )
        );
      } else {
        behaviour.isEnabled = particleData.behaviour.force.isEnabled;
        behaviour.force.x = particleData.behaviour.force.fx * 100;
        behaviour.force.y = particleData.behaviour.force.fy * 100;
        behaviour.force.z = particleData.behaviour.force.fz * 100;
        behaviour._life = particleData.behaviour.force.life;
        behaviour.easing = Particle.ease[particleData.behaviour.force.easing];
      }
    },
    rotate:() => {
      const behaviour = emitter.behaviours.find((item) => item.type === "Rotate");
      if (!behaviour) {
        emitter.addBehaviour(
            new Particle.Rotate(
              particleData.behaviour.rotate.x, 
              particleData.behaviour.rotate.y, 
              particleData.behaviour.rotate.z, 
              particleData.behaviour.rotate.life, 
              Particle.ease[particleData.behaviour.rotate.easing],
              particleData.behaviour.rotate.isEnabled
            )
        );
      }else{
        behaviour.isEnabled = particleData.behaviour.rotate.isEnabled;
        behaviour.x.a = behaviour.x.b = particleData.behaviour.rotate.x * Math.PI / 180;
        behaviour.y.a = behaviour.y.b = particleData.behaviour.rotate.y * Math.PI / 180;
        behaviour.z.a = behaviour.z.b = particleData.behaviour.rotate.z * Math.PI / 180;
        behaviour._life = particleData.behaviour.rotate.life;
        behaviour.easing = Particle.ease[particleData.behaviour.rotate.easing];
      }
    },
    randomDrift: () => {
      const behaviour = emitter.behaviours.find((item) => item.type === "RandomDrift");
      if (!behaviour) {
        emitter.addBehaviour(
          new Particle.RandomDrift(
            particleData.behaviour.randomDrift.driftX,
            particleData.behaviour.randomDrift.driftY,
            particleData.behaviour.randomDrift.driftZ,
            particleData.behaviour.randomDrift.delay,
            particleData.behaviour.randomDrift.life,
            Particle.ease[particleData.behaviour.randomDrift.easing],
            particleData.behaviour.randomDrift.isEnabled
          )
        );
      }else{
        behaviour.isEnabled = particleData.behaviour.randomDrift.isEnabled;
        behaviour.randomForce.x = particleData.behaviour.randomDrift.driftX * 100;
        behaviour.randomForce.y = particleData.behaviour.randomDrift.driftY * 100;
        behaviour.randomForce.z = particleData.behaviour.randomDrift.driftZ * 100;
        behaviour.delayPan.a = behaviour.delayPan.b = particleData.behaviour.randomDrift.delay;
        behaviour._life = particleData.behaviour.randomDrift.life;
        behaviour.easing = Particle.ease[particleData.behaviour.randomDrift.easing];
      }
    },        
    spring: () => {
      const behaviour = emitter.behaviours.find((item) => item.type === "Spring");
      if (!behaviour) {
        emitter.addBehaviour(
          new Particle.Spring(
            particleData.behaviour.spring.x, 
            particleData.behaviour.spring.y, 
            particleData.behaviour.spring.z, 
            particleData.behaviour.spring.spring, 
            particleData.behaviour.spring.friction, 
            particleData.behaviour.spring.life, 
            Particle.ease[particleData.behaviour.spring.easing], 
            particleData.behaviour.spring.isEnabled
          )
        );
      }else{
        behaviour.isEnabled = particleData.behaviour.spring.isEnabled;
        behaviour.pos.x = particleData.behaviour.spring.x;
        behaviour.pos.y = particleData.behaviour.spring.y;
        behaviour.pos.z = particleData.behaviour.spring.z;
        behaviour.spring = particleData.behaviour.spring.spring;
        behaviour.friction = particleData.behaviour.spring.friction;
        behaviour._life = particleData.behaviour.spring.life;
        behaviour.easing = Particle.ease[particleData.behaviour.spring.easing];
      }
    },
    attraction: () => {
      const behaviour = emitter.behaviours.find((item) => item.type === "Attraction");
      if (!behaviour) {
        emitter.addBehaviour(
          new Particle.Attraction(
            new Particle.Vector3D(
              particleData.behaviour.attraction.x, 
              particleData.behaviour.attraction.y, 
              particleData.behaviour.attraction.z
            ),
            particleData.behaviour.attraction.force,
            particleData.behaviour.attraction.radius,
            particleData.behaviour.attraction.life,
            Particle.ease[particleData.behaviour.attraction.easing],
            particleData.behaviour.attraction.isEnabled
          )
        );
      }else{
        behaviour.isEnabled = particleData.behaviour.attraction.isEnabled;
        behaviour.targetPosition.x = particleData.behaviour.attraction.x;
        behaviour.targetPosition.y = particleData.behaviour.attraction.y;
        behaviour.targetPosition.z = particleData.behaviour.attraction.z;
        behaviour.force = particleData.behaviour.attraction.force * 100;
        behaviour.radius = particleData.behaviour.attraction.radius;
        behaviour._life = particleData.behaviour.attraction.life;
        behaviour.easing = Particle.ease[particleData.behaviour.attraction.easing];
      }
    },
    collision: () => {
      const behaviour = emitter.behaviours.find((item) => item.type === "Collision");
      if (!behaviour) {
        emitter.addBehaviour(
          new Particle.Collision(
            emitter, 
            particleData.behaviour.collision.useMass,
             () => {}, 
             particleData.behaviour.collision.life, 
             Particle.ease[particleData.behaviour.collision.easing], 
             particleData.behaviour.collision.isEnabled
          )
        );
      }else{
        behaviour.isEnabled = particleData.behaviour.collision.isEnabled;
        behaviour.useMass = particleData.behaviour.collision.useMass;
        behaviour._life = particleData.behaviour.collision.life;
        behaviour.easing = Particle.ease[particleData.behaviour.collision.easing];
      }
    }
  }

  call[method]();
}
</script>

<template>
  <n-tabs type="segment" animated>
    <n-tab-pane name="attribute" display-directive="show:lazy" :tab="t('layout.sider.particle.Attributes')">
      <Attributes :data="particleData.attr" @update="update" />
    </n-tab-pane>

    <n-tab-pane name="initializer" display-directive="show:lazy" :tab="t('layout.sider.particle.Initializers')">
      <Initializer :data="particleData.init" @update="update" />
    </n-tab-pane>

    <n-tab-pane name="behaviour" display-directive="show:lazy" :tab="t('layout.sider.particle.Behaviours')">
      <Behaviour :data="particleData.behaviour" :hasMass="particleData.init.mass.isEnabled" @update="update" />
    </n-tab-pane>
  </n-tabs>
</template>

<style scoped lang="less">
.n-tabs {
  height: 100% !important;

  :deep(.n-tabs-pane-wrapper) {
    height: calc(100% - 30px);
    overflow-y: auto;
  }

  .n-tab-pane {
    padding: 0.5rem 0 !important;

    :deep(.particle-config-item) {
      display: flex;
      align-items: center;
      padding: 0.3rem 0.3rem;
      width: calc(100% - 0.6rem);

      & > :first-child {
        width: 35%;
        text-align: left;
        margin-right: 0.5rem;
      }

      & > :last-child {
        width: calc(65% - 0.5rem);
      }
    }
  }
}
</style>