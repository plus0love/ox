import ProblemForm from '../components/ProblemForm'

export default function AddTab({ state, onCreate }) {
  return (
    <div className="p-4">
      <h1 className="mb-1 text-2xl font-black text-slate-800">오답 등록</h1>
      <p className="mb-5 text-[15px] text-slate-500">
        등록 후에도 폼이 유지되어 연속으로 입력할 수 있습니다.
      </p>
      <ProblemForm subjects={state.subjects} onSubmit={onCreate} submitLabel="등록하기" />
    </div>
  )
}
