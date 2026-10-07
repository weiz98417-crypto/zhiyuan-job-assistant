/** spec 34:工作台三原语渲染测试。 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { PageHeading, SearchInput, EmptyState } from "@/components/ui/workbench-primitives";

afterEach(() => cleanup());

describe("工作台三原语(spec 34)", () => {
  it("PageHeading:meta+标题+动作槽", () => {
    render(createElement(PageHeading, {
      meta: "3 条投递记录",
      title: "投递追踪",
      actions: createElement("button", { "data-testid": "act" }, "导出"),
    }));
    expect(screen.getByText("3 条投递记录")).toBeTruthy();
    expect(screen.getByText("投递追踪")).toBeTruthy();
    expect(screen.getByTestId("act")).toBeTruthy();
  });

  it("PageHeading:无动作时不渲染动作槽", () => {
    const { container } = render(createElement(PageHeading, { meta: "x", title: "y" }));
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("SearchInput:输入、清空按钮有值才显示、清空回调", () => {
    const onChange = vi.fn();
    const { rerender, container } = render(createElement(SearchInput, { value: "字节", onChange }));
    expect((container.querySelector("input") as HTMLInputElement).value).toBe("字节");
    fireEvent.click(screen.getByLabelText("清空搜索"));
    expect(onChange).toHaveBeenCalledWith("");
    rerender(createElement(SearchInput, { value: "", onChange }));
    expect(screen.queryByLabelText("清空搜索")).toBeNull();
  });

  it("EmptyState:图标/标题/说明/动作", () => {
    render(createElement(EmptyState, {
      icon: createElement("span", { "data-testid": "ico" }, "i"),
      title: "暂无数据",
      hint: "开始使用后展示",
      action: createElement("button", { "data-testid": "go" }, "去发起"),
    }));
    expect(screen.getByTestId("ico")).toBeTruthy();
    expect(screen.getByText("暂无数据")).toBeTruthy();
    expect(screen.getByText("开始使用后展示")).toBeTruthy();
    expect(screen.getByTestId("go")).toBeTruthy();
  });
});
