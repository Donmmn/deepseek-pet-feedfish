import { describe, expect, it } from 'vitest'
import { poseEditorHtml } from '../pose-editor/pose-editor-page.js'

describe('standalone pose editor', () => {
  it('keeps animation editing and layered footwear outside the pet runtime', () => {
    const page = poseEditorHtml()
    expect(page).toContain('骨骼动画参考编辑器')
    expect(page).toContain('deepseek-token-pet/leg-pose@2')
    expect(page).toContain('id="footwear"')
    expect(page).toContain("config.animation.enabled&&drag===null")
    expect(page).toContain("drawLeg(far,'far');drawLeg(near,'near')")
    expect(page).toContain('ctx.scale(-1,1)')
    expect(page).toContain('人体右腿（画面左 / 远端）')
    expect(page).toContain('人体左腿（画面右 / 近端）')
    expect(page).toContain("if(name==='far')ctx.drawImage(foot,-.5,-9.1,24,19.6);else ctx.drawImage(foot,-.5,-10.08,24,23.52)")
    expect(page).toContain('ctx.globalAlpha=1')
    expect(page).toContain("style:'white-stockings',footwear:'shoes',showBones:true")
    expect(page).toContain('far:{rootX:54,rootY:62.5,thighAngle:12,calfAngle:-173.13,footAngle:-17.48,scale:.74,alpha:.9}')
    expect(page).toContain('near:{rootX:62,rootY:72.1,thighAngle:8,calfAngle:-165,footAngle:14.87,scale:.78,alpha:1}')
    expect(page).toContain("if(name==='far')ctx.rotate(radians(-3))")
    expect(page).toContain("ctx.drawImage(shoe,-.5,-10.627,26.4,25.872)")
    expect(page).toContain('output.footAngle-=swing*8')
    expect(page).toContain('rotate(-22*pose.scale,0,footGlobal)')
    expect(page).toContain('data-leg="near"')
    expect(page).toContain('复制 JSON')
  })
})
