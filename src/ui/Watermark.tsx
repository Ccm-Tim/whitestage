export function Watermark({ inEditor }: { inEditor: boolean }) {
  return (
    <div
      className={`cc-watermark ${inEditor ? 'editor' : 'start'}`}
      title="作者：CC菜 · 仅供分享学习使用，请勿商用"
      aria-label="CC菜，仅供分享学习使用，请勿商用"
    >
      <b>CC菜</b>
      <span>仅供分享学习使用</span>
      <span>请勿商用</span>
    </div>
  )
}
